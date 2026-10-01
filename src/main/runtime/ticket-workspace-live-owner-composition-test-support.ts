import {
  digestNavigatorSnapshotV1,
  validateTicketNavigatorSnapshotV1,
  type TicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type { NativeGitOperationMarkerCapture } from '../git/native-git-operation-marker-capture'
import type { NativeGitWorktreeStatusRecordCapture } from '../git/native-worktree-status-record-capture'
import {
  issueTicketWorkspaceCurrentnessToken,
  isTicketWorkspaceCurrentnessToken,
  type CurrentTicketOwnerRead,
  type TicketWorkspaceOwnerSourcePort
} from '../ticket-workspace/ticket-workspace-resident-source-port'
import type { TicketResidentBinding } from '../ticket-workspace/ticket-workspace-resident-protocol'
import type { ExactLocalNativeGitStatusRecordCapture } from './runtime-git-status-record-capture'
import type { ExactLocalNativeGitWorktreeBinding } from './runtime-worktree-catalog-binding'
import type { TicketWorkspaceLiveOwnerCompositionDependencies } from './ticket-workspace-live-owner-composition'
import {
  createLocalNativeWorktreeBindingHarness,
  createWorktreeCatalogSourceSnapshot,
  makePositiveTicketWorkspaceSnapshot
} from './__fixtures__/ticket-workspace-owner-fixtures'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'

export type OwnerClockHarness = Readonly<{
  clock: Readonly<{ monotonicNow(): number }>
  advanceBy(milliseconds: number): void
  now(): number
}>

export type OwnerSourcePortHarness = Readonly<{
  port: TicketWorkspaceOwnerSourcePort
  budgets: number[]
  signals: AbortSignal[]
  reads: CurrentTicketOwnerRead[]
  getReadCount(): number
  setCurrent(value: boolean): void
  revoke(read: CurrentTicketOwnerRead): void
  setBaselineAvailable(value: boolean): void
}>

export function createOwnerClock(start = 10_000): OwnerClockHarness {
  let current = start
  return {
    clock: { monotonicNow: () => current },
    advanceBy: (milliseconds) => {
      current += milliseconds
    },
    now: () => current
  }
}

export function createOwnerSourcePort(
  baseline: TicketNavigatorSnapshotV1,
  readSnapshots: readonly TicketNavigatorSnapshotV1[],
  clock: OwnerClockHarness,
  options: Readonly<{ connectionIncarnations?: readonly string[] }> = {}
): OwnerSourcePortHarness {
  const reads = new WeakSet<object>()
  const revokedReads = new WeakSet<object>()
  const budgets: number[] = []
  const signals: AbortSignal[] = []
  const admittedReads: CurrentTicketOwnerRead[] = []
  const queued = [...readSnapshots]
  let lastSnapshot = queued.at(-1) ?? baseline
  let readCount = 0
  let current = true
  let baselineAvailable = true
  const binding: TicketResidentBinding = {
    profile: baseline.profile,
    authorityId: baseline.source.authorityId,
    executionHost: { kind: 'wsl', machineId: 'authority-host', distro: 'Ubuntu-24.04' },
    expectedService: {
      producerName: 'ticket-workspace',
      releaseId: baseline.producer.version,
      artifactSha256: 'a'.repeat(64)
    }
  }
  const port: TicketWorkspaceOwnerSourcePort = {
    async readCurrentSnapshot(signal, deadlineBudgetMs) {
      signals.push(signal)
      budgets.push(deadlineBudgetMs)
      readCount += 1
      const snapshot = queued.shift() ?? lastSnapshot
      lastSnapshot = snapshot
      const read: CurrentTicketOwnerRead = Object.freeze({
        snapshot,
        evidence: Object.freeze({
          binding,
          ledgerEpoch: snapshot.source.ledgerEpoch,
          connectionIncarnation: options.connectionIncarnations?.[readCount - 1] ?? 'connection-1',
          readStartedAtMonotonicMs: clock.now(),
          source: snapshot.source,
          currentnessToken: issueTicketWorkspaceCurrentnessToken()
        })
      })
      reads.add(read)
      admittedReads.push(read)
      return signal.aborted ? null : read
    },
    isCurrent(read) {
      return (
        current &&
        reads.has(read) &&
        !revokedReads.has(read) &&
        isTicketWorkspaceCurrentnessToken(read.evidence.currentnessToken)
      )
    },
    getDisplayedBaseline(snapshotRevision) {
      return baselineAvailable && baseline.snapshotRevision === snapshotRevision ? baseline : null
    }
  }
  return {
    port,
    budgets,
    signals,
    reads: admittedReads,
    getReadCount: () => readCount,
    setCurrent: (value) => {
      current = value
    },
    revoke: (read) => revokedReads.add(read),
    setBaselineAvailable: (value) => {
      baselineAvailable = value
    }
  }
}

export function createOwnerSelection(): Readonly<{
  baseline: TicketNavigatorSnapshotV1
  selection: TicketWorkspaceOwnerSelection
}> {
  const { snapshot: fixture, selector } = makePositiveTicketWorkspaceSnapshot({
    referenceState: 'unavailable'
  })
  const snapshot = makeResidentSnapshot(fixture)
  return {
    baseline: snapshot,
    selection: Object.freeze({ ...selector, snapshotRevision: snapshot.snapshotRevision })
  }
}

export function makeResidentSnapshot(
  snapshot: TicketNavigatorSnapshotV1
): TicketNavigatorSnapshotV1 {
  return refreshSnapshot(snapshot, (residentSnapshot) => {
    residentSnapshot.source.projectionSequence = 0
    for (const ticket of residentSnapshot.tickets) {
      ticket.actions = []
      for (const workspace of ticket.workspaces) {
        workspace.actions = []
      }
    }
  })
}

export function refreshSnapshot(
  source: TicketNavigatorSnapshotV1,
  update: (snapshot: TicketNavigatorSnapshotV1) => void = () => undefined
): TicketNavigatorSnapshotV1 {
  const snapshot = structuredClone(source)
  update(snapshot)
  snapshot.snapshotRevision = digestNavigatorSnapshotV1(snapshot)
  const validation = validateTicketNavigatorSnapshotV1(snapshot)
  if (validation.schemaVerdict !== 'accepted') {
    throw new Error(`The owner composition test snapshot was rejected: ${validation.reasonCode}`)
  }
  return validation.value
}

export function createCompositionDependencies(
  sourcePort: TicketWorkspaceOwnerSourcePort,
  clock: OwnerClockHarness,
  options: Readonly<{
    ownerCurrent?: (binding: ExactLocalNativeGitWorktreeBinding) => boolean | Promise<boolean>
    afterResolve?: (binding: ExactLocalNativeGitWorktreeBinding) => void
    capture?: (
      binding: ExactLocalNativeGitWorktreeBinding
    ) => ExactLocalNativeGitStatusRecordCapture | Promise<ExactLocalNativeGitStatusRecordCapture>
  }> = {}
): Readonly<{
  dependencies: TicketWorkspaceLiveOwnerCompositionDependencies
  getResolveCount(): number
  getRevalidationCount(): number
  captureCalls: ExactLocalNativeGitStatusRecordCapture['binding'][]
  setOwnerCatalogRevision(revision: number): void
}> {
  const harness = createLocalNativeWorktreeBindingHarness()
  let resolveCount = 0
  let revalidationCount = 0
  const captureCalls: ExactLocalNativeGitStatusRecordCapture['binding'][] = []
  const dependencies: TicketWorkspaceLiveOwnerCompositionDependencies = {
    sourcePort,
    clock: clock.clock,
    worktreeBindings: {
      async resolveExactLocalNativeGitTarget(request, signal) {
        resolveCount += 1
        const binding = await harness.commands.resolveExactLocalNativeGitTarget(request, signal)
        options.afterResolve?.(binding)
        return binding
      },
      async isExactLocalNativeGitBindingCurrent(binding, signal) {
        revalidationCount += 1
        const overridden = options.ownerCurrent?.(binding)
        return overridden === undefined
          ? harness.commands.isExactLocalNativeGitBindingCurrent(binding, signal)
          : overridden
      }
    },
    statusCapture: {
      async captureExactLocalNativeGitStatusRecords(binding) {
        captureCalls.push(binding)
        const overridden = options.capture?.(binding)
        return overridden === undefined ? completeCapture(binding) : overridden
      }
    }
  }
  return {
    dependencies,
    getResolveCount: () => resolveCount,
    getRevalidationCount: () => revalidationCount,
    captureCalls,
    setOwnerCatalogRevision: (revision) =>
      harness.setSourceSnapshot(createWorktreeCatalogSourceSnapshot({ revision }))
  }
}

export function completeCapture(
  binding: ExactLocalNativeGitStatusRecordCapture['binding']
): ExactLocalNativeGitStatusRecordCapture {
  const status: NativeGitWorktreeStatusRecordCapture = {
    executionRoute: 'native',
    complete: true,
    rawRecordCount: 0,
    representedRecordCount: 0,
    unsupportedRecordCount: 0,
    records: []
  }
  const operationMarkers: NativeGitOperationMarkerCapture = {
    complete: true,
    filesystemRoute: 'native',
    markers: {
      mergeHead: 'absent',
      cherryPickHead: 'absent',
      rebaseMerge: 'absent',
      rebaseApply: 'absent'
    }
  }
  return Object.freeze({
    binding,
    effectiveSubject: binding.registrationIdentity,
    status,
    operationMarkers,
    observationId: 'owner-observation-1',
    ownerReadStartedAt: 1_800_000_000_000
  })
}
