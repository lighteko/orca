import {
  serializeTicketNavigatorSnapshotUtf8V1,
  type TicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { describe, expect, it } from 'vitest'
import {
  binding,
  parseFrame,
  parseProtectedRequestId,
  protectedFrames,
  randomSource,
  setupKey,
  ScriptedDuplex,
  snapshotMessages,
  sourceBoundWire,
  vector
} from '../ticket-workspace/ticket-workspace-resident-test-peer'
import {
  connectTicketWorkspaceResidentSourceAdapter,
  type TicketWorkspaceResidentSourceAdapter
} from '../ticket-workspace/ticket-workspace-resident-source-adapter'
import type {
  CurrentTicketOwnerRead,
  TicketWorkspaceOwnerSourcePort
} from '../ticket-workspace/ticket-workspace-resident-source-port'
import { TicketWorkspaceResidentHighWater } from '../ticket-workspace/ticket-workspace-resident-high-water'
import { MemoryResidentSourceHighWaterStore } from '../ticket-workspace/ticket-workspace-resident-high-water-test-store'
import { RuntimeTicketWorkspaceLiveOwnerCompositionCommands } from './ticket-workspace-live-owner-composition'
import { OWNER_TEST_WORKTREE_ID } from './__fixtures__/ticket-workspace-owner-fixtures'
import {
  completeCapture,
  createCompositionDependencies,
  createOwnerClock,
  createOwnerSelection,
  refreshSnapshot
} from './ticket-workspace-live-owner-composition-test-support'

describe('live owner composition through the admitted resident source', () => {
  it('matches, rebinds, and captures from fresh reads without replacing the displayed snapshot', async () => {
    const clock = createOwnerClock()
    const { baseline: fixture, selection: selector } = createOwnerSelection()
    const displayed = sourceSnapshot(fixture, '1900-01-01T00:00:00.000Z')
    const regenerated = Array.from({ length: 7 }, (_, index) =>
      sourceSnapshot(fixture, new Date(Date.UTC(2100, 0, 1, 0, 0, index)).toISOString())
    )
    const displayedRevision: { current: string | null } = { current: null }
    const peer = await connectSourceAdapter(
      [displayed, ...regenerated],
      clock,
      () => displayedRevision.current
    )
    try {
      const initialRead = await peer.source.readCurrentSnapshot(
        new AbortController().signal,
        10_000
      )
      expect(initialRead).not.toBeNull()
      if (!initialRead) {
        return
      }
      displayedRevision.current = displayed.snapshotRevision
      expect(peer.source.presentSnapshot(initialRead)).toBe(true)
      expect(peer.source.getDisplayedBaseline(displayed.snapshotRevision)).toEqual(displayed)

      const selection = { ...selector, snapshotRevision: displayed.snapshotRevision }
      const runtime = createCompositionDependencies(peer.source, clock)
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(commands.matchSelection(selection)).resolves.toEqual({
        status: 'matched',
        snapshotRevision: displayed.snapshotRevision,
        ticketKey: selection.ticketKey,
        repositoryId: selection.repositoryId
      })
      expect(peer.readRequests).toHaveLength(3)
      const rebound = await commands.rebindSelectionAtClick(selection)
      expect(rebound).toEqual({
        status: 'rebound',
        snapshotRevision: displayed.snapshotRevision,
        ticketKey: selection.ticketKey,
        repositoryId: selection.repositoryId,
        worktreeId: OWNER_TEST_WORKTREE_ID
      })
      expect(peer.readRequests).toHaveLength(5)
      const evidence = await commands.captureStatusEvidence(selection)
      expect(evidence).toMatchObject({
        status: 'captured',
        snapshotRevision: displayed.snapshotRevision,
        ticketKey: selection.ticketKey,
        repositoryId: selection.repositoryId,
        observationId: 'owner-observation-1',
        ownerReadStartedAt: 1_800_000_000_000
      })
      if (evidence.status !== 'captured') {
        return
      }
      expect(evidence.source).toEqual(displayed.source)
      expect(evidence.workspaceRef).toEqual(
        displayed.tickets[0]?.workspaces.find(
          (workspace) => workspace.repositoryId === selection.repositoryId
        )?.target
      )
      expect(evidence.statusCapture.complete).toBe(true)
      expect(evidence.operationMarkers.complete).toBe(true)

      expect(peer.readRequests).toHaveLength(8)
      expect(peer.readRequests.every((request) => request.deadlineBudgetMs === 10_000)).toBe(true)
      expect(new Set(peer.readRequests.map((request) => request.requestId)).size).toBe(8)
      expect(peer.source.isCurrent(initialRead)).toBe(true)
      expect(peer.source.getDisplayedBaseline(displayed.snapshotRevision)).toEqual(displayed)
      expect(peer.source.getDisplayedBaseline(regenerated[0]?.snapshotRevision ?? '')).toBeNull()
      expect(totalStoreReads(peer.store)).toBe(9)
      expect(peer.store.committedCandidates).toHaveLength(1)
    } finally {
      peer.source.close()
    }
  })

  it('does not let an expired same-revision internal reread renew the displayed receipt', async () => {
    const clock = createOwnerClock()
    const { baseline } = createOwnerSelection()
    const snapshot = sourceSnapshot(baseline, '2001-01-01T00:00:00.000Z')
    const displayedRevision: { current: string | null } = {
      current: snapshot.snapshotRevision
    }
    const peer = await connectSourceAdapter(
      [snapshot, snapshot, snapshot, snapshot],
      clock,
      () => displayedRevision.current
    )
    try {
      const first = await peer.source.readCurrentSnapshot(new AbortController().signal, 10_000)
      expect(first).not.toBeNull()
      if (!first) {
        return
      }
      expect(peer.source.presentSnapshot(first)).toBe(true)
      clock.advanceBy(30_000)
      expect(peer.source.isCurrent(first)).toBe(false)
      expect(peer.source.getDisplayedBaseline(snapshot.snapshotRevision)).toBeNull()

      const reread = await peer.source.readCurrentSnapshot(new AbortController().signal, 10_000)
      expect(reread).not.toBeNull()
      if (!reread) {
        return
      }
      expect(reread.snapshot.snapshotRevision).toBe(snapshot.snapshotRevision)
      expect(peer.source.getDisplayedBaseline(snapshot.snapshotRevision)).toBeNull()
      const { selection: selector } = createOwnerSelection()
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(
        createCompositionDependencies(peer.source, clock).dependencies
      )
      await expect(
        commands.matchSelection({ ...selector, snapshotRevision: snapshot.snapshotRevision })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(peer.readRequests).toHaveLength(2)

      expect(peer.source.presentSnapshot(reread)).toBe(true)
      expect(peer.source.getDisplayedBaseline(snapshot.snapshotRevision)).toEqual(snapshot)
      await expect(
        commands.matchSelection({ ...selector, snapshotRevision: snapshot.snapshotRevision })
      ).resolves.toMatchObject({ status: 'matched' })
      expect(peer.readRequests).toHaveLength(4)
    } finally {
      peer.source.close()
    }
  })

  it('fails closed on whole-snapshot unsupported peers and suppressed selected targets', async () => {
    const clock = createOwnerClock()
    const { baseline, selection: selector } = createOwnerSelection()
    const supported = sourceSnapshot(baseline, '2026-01-01T00:00:00.000Z')
    const unsupportedPeer = sourceSnapshot(baseline, '2026-01-01T00:00:00.000Z', {}, (snapshot) => {
      const row = structuredClone(snapshot.tickets[0])
      if (!row) {
        throw new Error('The live owner fixture has no ticket to clone')
      }
      row.ticketKey = 'OTHER-1'
      row.availability = 'unsupported'
      row.workspaces = []
      row.actions = []
      snapshot.tickets.push(row)
    })
    const unsupportedView: { current: string | null } = { current: null }
    const unsupportedPeerSource = await connectSourceAdapter(
      [supported, unsupportedPeer],
      clock,
      () => unsupportedView.current
    )
    try {
      const initialRead = await presentInitialRead(
        unsupportedPeerSource.source,
        supported,
        unsupportedView
      )
      const runtime = createCompositionDependencies(unsupportedPeerSource.source, clock)
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.matchSelection({ ...selector, snapshotRevision: supported.snapshotRevision })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(unsupportedPeerSource.readRequests).toHaveLength(2)
      expect(unsupportedPeerSource.source.isCurrent(initialRead)).toBe(false)
      expect(runtime.getResolveCount()).toBe(0)
      expect(totalStoreReads(unsupportedPeerSource.store)).toBe(2)
      expect(unsupportedPeerSource.store.committedCandidates).toHaveLength(1)
    } finally {
      unsupportedPeerSource.source.close()
    }

    const suppressed = sourceSnapshot(baseline, '2026-01-01T00:00:00.000Z', {}, (snapshot) => {
      const ticket = snapshot.tickets.find((row) => row.ticketKey === selector.ticketKey)
      const workspace = ticket?.workspaces.find((row) => row.repositoryId === selector.repositoryId)
      if (!workspace) {
        throw new Error('The live owner fixture has no selected workspace')
      }
      delete workspace.target
    })
    const suppressedRevision: { current: string | null } = { current: null }
    const suppressedSource = await connectSourceAdapter(
      [supported, suppressed],
      clock,
      () => suppressedRevision.current
    )
    try {
      const initialRead = await suppressedSource.source.readCurrentSnapshot(
        new AbortController().signal,
        10_000
      )
      expect(initialRead).not.toBeNull()
      if (!initialRead) {
        return
      }
      suppressedRevision.current = supported.snapshotRevision
      expect(suppressedSource.source.presentSnapshot(initialRead)).toBe(true)
      const runtime = createCompositionDependencies(suppressedSource.source, clock)
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.matchSelection({ ...selector, snapshotRevision: supported.snapshotRevision })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(suppressedSource.readRequests).toHaveLength(2)
      expect(suppressedSource.source.isCurrent(initialRead)).toBe(true)
      expect(runtime.getResolveCount()).toBe(0)
    } finally {
      suppressedSource.source.close()
    }
  })

  it('fails owner match, click, and evidence when fresh source reads advance, regress, or equivocate', async () => {
    const clock = createOwnerClock()
    const { baseline: fixture, selection: selector } = createOwnerSelection()
    const initial = sourceSnapshot(fixture, '2026-01-01T00:00:00.000Z')
    const advanced = sourceSnapshot(fixture, '2026-01-01T00:01:00.000Z', {
      ledgerRevision: 8,
      catalogDigest: 'b'.repeat(64)
    })
    const regression = sourceSnapshot(fixture, '2026-01-01T00:02:00.000Z')
    const advancedView: { current: string | null } = { current: null }
    const advancingPeer = await connectSourceAdapter(
      [initial, advanced],
      clock,
      () => advancedView.current
    )
    try {
      const first = await presentInitialRead(advancingPeer.source, initial, advancedView)
      const observed: CurrentTicketOwnerRead[] = []
      const runtime = createCompositionDependencies(
        observingOwnerPort(advancingPeer.source, observed),
        clock
      )
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.matchSelection({ ...selector, snapshotRevision: initial.snapshotRevision })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(observed).toHaveLength(1)
      expect(advancingPeer.source.isCurrent(first)).toBe(false)
      const advancedRead = observed[0]
      expect(advancedRead).toBeDefined()
      if (!advancedRead) {
        return
      }
      expect(advancingPeer.source.isCurrent(advancedRead)).toBe(true)
      expect(advancingPeer.store.quarantinedReasons).toHaveLength(0)
      expect(advancingPeer.readRequests).toHaveLength(2)
    } finally {
      advancingPeer.source.close()
    }

    const newerBaseline = sourceSnapshot(fixture, '2026-01-01T00:03:00.000Z', {
      ledgerRevision: 8,
      catalogDigest: 'b'.repeat(64)
    })
    const regressionView: { current: string | null } = { current: null }
    const regressionClock = createOwnerClock()
    const regressionPeer = await connectSourceAdapter(
      [newerBaseline, regression],
      regressionClock,
      () => regressionView.current
    )
    try {
      const first = await presentInitialRead(regressionPeer.source, newerBaseline, regressionView)
      const observed: CurrentTicketOwnerRead[] = []
      const runtime = createCompositionDependencies(
        observingOwnerPort(regressionPeer.source, observed),
        regressionClock
      )
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.rebindSelectionAtClick({
          ...selector,
          snapshotRevision: newerBaseline.snapshotRevision
        })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(observed).toHaveLength(0)
      expect(regressionPeer.source.isCurrent(first)).toBe(false)
      expect(regressionPeer.store.quarantinedReasons).toContain('source_revision_regression')
      expect(regressionPeer.readRequests).toHaveLength(2)
    } finally {
      regressionPeer.source.close()
    }

    const equivocation = sourceSnapshot(fixture, '2026-01-01T00:04:00.000Z', {
      catalogDigest: 'c'.repeat(64)
    })
    const equivocationView: { current: string | null } = { current: null }
    const equivocationClock = createOwnerClock()
    const equivocationPeer = await connectSourceAdapter(
      [initial, equivocation],
      equivocationClock,
      () => equivocationView.current
    )
    try {
      const first = await presentInitialRead(equivocationPeer.source, initial, equivocationView)
      const observed: CurrentTicketOwnerRead[] = []
      const runtime = createCompositionDependencies(
        observingOwnerPort(equivocationPeer.source, observed),
        equivocationClock
      )
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.captureStatusEvidence({ ...selector, snapshotRevision: initial.snapshotRevision })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(observed).toHaveLength(0)
      expect(runtime.captureCalls).toHaveLength(0)
      expect(equivocationPeer.source.isCurrent(first)).toBe(false)
      expect(equivocationPeer.store.quarantinedReasons).toContain('source_equivocation')
      expect(equivocationPeer.readRequests).toHaveLength(2)
    } finally {
      equivocationPeer.source.close()
    }
  })

  it('rejects a real owner catalog replacement during final binding revalidation', async () => {
    const clock = createOwnerClock()
    const { baseline: fixture, selection: selector } = createOwnerSelection()
    const baseline = sourceSnapshot(fixture, '2026-01-01T00:00:00.000Z')
    const snapshots = [baseline, baseline, baseline]
    const displayedRevision: { current: string | null } = { current: null }
    const peer = await connectSourceAdapter(snapshots, clock, () => displayedRevision.current)
    try {
      const initialRead = await peer.source.readCurrentSnapshot(
        new AbortController().signal,
        10_000
      )
      expect(initialRead).not.toBeNull()
      if (!initialRead) {
        return
      }
      displayedRevision.current = baseline.snapshotRevision
      expect(peer.source.presentSnapshot(initialRead)).toBe(true)

      let sourceReads = 0
      let runtime: ReturnType<typeof createCompositionDependencies> | undefined
      const ownerPort: TicketWorkspaceOwnerSourcePort = {
        async readCurrentSnapshot(signal, budget) {
          const read = await peer.source.readCurrentSnapshot(signal, budget)
          sourceReads += 1
          if (sourceReads === 2) {
            runtime?.setOwnerCatalogRevision(4)
          }
          return read
        },
        isCurrent: (read) => peer.source.isCurrent(read),
        getDisplayedBaseline: (revision) => peer.source.getDisplayedBaseline(revision)
      }
      runtime = createCompositionDependencies(ownerPort, clock)
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.matchSelection({ ...selector, snapshotRevision: baseline.snapshotRevision })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(sourceReads).toBe(2)
      expect(peer.source.isCurrent(initialRead)).toBe(true)
      expect(peer.readRequests).toHaveLength(3)
    } finally {
      peer.source.close()
    }
  })

  it('returns unavailable when the resident lease retires during deferred owner revalidation', async () => {
    const clock = createOwnerClock()
    const { baseline: fixture, selection } = createOwnerSelection()
    const baseline = sourceSnapshot(fixture, '2026-01-01T00:00:00.000Z')
    const displayedRevision: { current: string | null } = { current: null }
    const peer = await connectSourceAdapter(
      [baseline, baseline, baseline],
      clock,
      () => displayedRevision.current
    )
    try {
      const initialRead = await presentInitialRead(peer.source, baseline, displayedRevision)
      let markRevalidationStarted!: () => void
      let releaseRevalidation!: (current: boolean) => void
      const revalidationStarted = new Promise<void>((resolve) => {
        markRevalidationStarted = resolve
      })
      const runtime = createCompositionDependencies(peer.source, clock, {
        ownerCurrent: () => {
          markRevalidationStarted()
          return new Promise<boolean>((resolve) => {
            releaseRevalidation = resolve
          })
        }
      })
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      const pending = commands.matchSelection({
        ...selection,
        snapshotRevision: baseline.snapshotRevision
      })

      await revalidationStarted
      peer.source.close()
      expect(peer.source.isCurrent(initialRead)).toBe(false)
      expect(peer.source.getDisplayedBaseline(baseline.snapshotRevision)).toBeNull()
      releaseRevalidation(true)
      await expect(pending).resolves.toMatchObject({ status: 'unavailable' })
      expect(peer.readRequests).toHaveLength(3)
    } finally {
      peer.source.close()
    }
  })

  it('does not return positive on display retirement, caller abort, deadline expiry, or partial capture', async () => {
    const { baseline: fixture, selection: selector } = createOwnerSelection()
    const baseline = sourceSnapshot(fixture, '2026-01-01T00:00:00.000Z')

    const viewClock = createOwnerClock()
    const view: { current: string | null } = { current: null }
    const viewPeer = await connectSourceAdapter(
      [baseline, baseline, baseline],
      viewClock,
      () => view.current
    )
    try {
      const initialRead = await presentInitialRead(viewPeer.source, baseline, view)
      const runtime = createCompositionDependencies(viewPeer.source, viewClock, {
        ownerCurrent: () => {
          view.current = null
          return true
        }
      })
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.matchSelection({ ...selector, snapshotRevision: baseline.snapshotRevision })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(viewPeer.source.isCurrent(initialRead)).toBe(true)
      expect(viewPeer.readRequests).toHaveLength(3)
    } finally {
      viewPeer.source.close()
    }

    const abortClock = createOwnerClock()
    const abortView: { current: string | null } = { current: null }
    const abortPeer = await connectSourceAdapter(
      [baseline, baseline, baseline],
      abortClock,
      () => abortView.current
    )
    try {
      await presentInitialRead(abortPeer.source, baseline, abortView)
      const controller = new AbortController()
      const runtime = createCompositionDependencies(abortPeer.source, abortClock, {
        ownerCurrent: () => {
          controller.abort()
          return true
        }
      })
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.matchSelection(
          { ...selector, snapshotRevision: baseline.snapshotRevision },
          controller.signal
        )
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(abortPeer.readRequests).toHaveLength(3)
    } finally {
      abortPeer.source.close()
    }

    const deadlineClock = createOwnerClock()
    const deadlineView: { current: string | null } = { current: null }
    const deadlinePeer = await connectSourceAdapter(
      [baseline, baseline, baseline],
      deadlineClock,
      () => deadlineView.current
    )
    try {
      await presentInitialRead(deadlinePeer.source, baseline, deadlineView)
      const runtime = createCompositionDependencies(deadlinePeer.source, deadlineClock, {
        ownerCurrent: () => {
          deadlineClock.advanceBy(30_000)
          return true
        }
      })
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.matchSelection({ ...selector, snapshotRevision: baseline.snapshotRevision })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(deadlinePeer.readRequests).toHaveLength(3)
    } finally {
      deadlinePeer.source.close()
    }

    const captureClock = createOwnerClock()
    const captureView: { current: string | null } = { current: null }
    const capturePeer = await connectSourceAdapter(
      [baseline, baseline, baseline, baseline],
      captureClock,
      () => captureView.current
    )
    try {
      await presentInitialRead(capturePeer.source, baseline, captureView)
      const runtime = createCompositionDependencies(capturePeer.source, captureClock, {
        capture: (ownerBinding) => {
          const capture = completeCapture(ownerBinding)
          return Object.freeze({
            ...capture,
            status: Object.freeze({ ...capture.status, complete: false })
          })
        }
      })
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      await expect(
        commands.captureStatusEvidence({ ...selector, snapshotRevision: baseline.snapshotRevision })
      ).resolves.toMatchObject({ status: 'unavailable' })
      expect(capturePeer.readRequests).toHaveLength(4)
    } finally {
      capturePeer.source.close()
    }
  })
})

type SourceChanges = Readonly<{
  catalogDigest?: string
  ledgerRevision?: number
}>
type SnapshotUpdate = (snapshot: TicketNavigatorSnapshotV1) => void

type PeerReadRequest = Readonly<{ requestId: string; deadlineBudgetMs: number }>

type ResidentSourcePeer = Readonly<{
  source: TicketWorkspaceResidentSourceAdapter
  store: MemoryResidentSourceHighWaterStore
  readRequests: PeerReadRequest[]
}>

function sourceSnapshot(
  fixture: TicketNavigatorSnapshotV1,
  generatedAt: string,
  changes: SourceChanges = {},
  update: SnapshotUpdate = () => undefined
): TicketNavigatorSnapshotV1 {
  return refreshSnapshot(fixture, (snapshot) => {
    snapshot.profile = { ...binding.profile }
    snapshot.producer.version = binding.expectedService.releaseId
    snapshot.generatedAt = generatedAt
    snapshot.staleAfter = new Date(Date.parse(generatedAt) + 60_000).toISOString()
    snapshot.source.authorityId = binding.authorityId
    snapshot.source.ledgerEpoch = 'epoch-a'
    snapshot.source.ledgerRevision = changes.ledgerRevision ?? 7
    snapshot.source.projectionSequence = 0
    snapshot.source.catalogDigest = changes.catalogDigest ?? 'a'.repeat(64)
    for (const ticket of snapshot.tickets) {
      ticket.actions = []
      for (const workspace of ticket.workspaces) {
        workspace.actions = []
        workspace.referenceState = 'unavailable'
      }
    }
    update(snapshot)
  })
}

async function connectSourceAdapter(
  snapshots: readonly TicketNavigatorSnapshotV1[],
  clock: ReturnType<typeof createOwnerClock>,
  getDisplayedSnapshotRevision: () => string | null
): Promise<ResidentSourcePeer> {
  let sequence = 1
  let nextSnapshot = 0
  const readRequests: PeerReadRequest[] = []
  const duplex = new ScriptedDuplex((index, frame, push) => {
    if (index === 0) {
      push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
    }
    if (index === 2) {
      push(sourceBoundWire)
    }
    if (index < 3) {
      return
    }
    const request = readRequest(frame)
    readRequests.push(request)
    const snapshot = snapshots[nextSnapshot]
    if (!snapshot) {
      throw new Error('The integration peer has no snapshot for this read request')
    }
    nextSnapshot += 1
    const frames = protectedFrames(
      snapshotMessages(
        Buffer.from(serializeTicketNavigatorSnapshotUtf8V1(snapshot), 'utf8'),
        request.requestId
      ),
      sequence
    )
    sequence += frames.length
    for (const response of frames) {
      push(response)
    }
  })
  const store = new MemoryResidentSourceHighWaterStore()
  const highWater = new TicketWorkspaceResidentHighWater(store, {
    authorizeFirstAdoption: async () => true,
    authorizeRebind: async () => true,
    authorizeRecovery: async () => true
  })
  const connected = await connectTicketWorkspaceResidentSourceAdapter({
    duplex,
    setupKey: Buffer.from(setupKey),
    expectedBinding: binding,
    highWater,
    clock: { now: clock.now, suspendGeneration: () => 0 },
    getDisplayedSnapshotRevision,
    randomBytes: uniqueRequestRandomSource()
  })
  if (connected.status !== 'connected') {
    throw new Error(`The authenticated resident peer failed setup: ${connected.reason}`)
  }
  return { source: connected.source, store, readRequests }
}

async function presentInitialRead(
  source: TicketWorkspaceResidentSourceAdapter,
  snapshot: TicketNavigatorSnapshotV1,
  displayedRevision: { current: string | null }
) {
  const read = await source.readCurrentSnapshot(new AbortController().signal, 10_000)
  expect(read).not.toBeNull()
  if (!read) {
    throw new Error('The authenticated source did not admit the displayed baseline')
  }
  displayedRevision.current = snapshot.snapshotRevision
  expect(source.presentSnapshot(read)).toBe(true)
  return read
}

function readRequest(frame: Buffer): PeerReadRequest {
  const message: unknown = parseFrame(frame).message
  if (
    message === null ||
    typeof message !== 'object' ||
    !('type' in message) ||
    message.type !== 'snapshot.read' ||
    !('deadlineBudgetMs' in message) ||
    typeof message.deadlineBudgetMs !== 'number' ||
    !Number.isSafeInteger(message.deadlineBudgetMs)
  ) {
    throw new Error('The source peer received a malformed snapshot request')
  }
  return Object.freeze({
    requestId: parseProtectedRequestId(frame),
    deadlineBudgetMs: message.deadlineBudgetMs
  })
}

function uniqueRequestRandomSource(): (size: number) => Buffer {
  return randomSource([
    Buffer.from(vector.inputs.sessionId, 'base64url'),
    Buffer.from(vector.inputs.clientNonce, 'base64url'),
    Buffer.from(vector.inputs.bindRequestId, 'base64url'),
    Buffer.from(vector.inputs.readRequestId, 'base64url'),
    ...Array.from({ length: 24 }, (_, index) => Buffer.alloc(16, index + 1))
  ])
}

function totalStoreReads(store: MemoryResidentSourceHighWaterStore): number {
  return [...store.readCounts.values()].reduce((total, count) => total + count, 0)
}

function observingOwnerPort(
  source: TicketWorkspaceResidentSourceAdapter,
  reads: CurrentTicketOwnerRead[]
): TicketWorkspaceOwnerSourcePort {
  return {
    async readCurrentSnapshot(signal, deadlineBudgetMs) {
      const read = await source.readCurrentSnapshot(signal, deadlineBudgetMs)
      if (read) {
        reads.push(read)
      }
      return read
    },
    isCurrent: (read) => source.isCurrent(read),
    getDisplayedBaseline: (revision) => source.getDisplayedBaseline(revision)
  }
}
