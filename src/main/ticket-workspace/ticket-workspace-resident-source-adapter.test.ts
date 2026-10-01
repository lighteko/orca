import {
  digestNavigatorSnapshotV1,
  serializeTicketNavigatorSnapshotUtf8V1,
  type TicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { describe, expect, it } from 'vitest'
import {
  binding,
  parseProtectedRequestId,
  protectedFrames,
  randomSource,
  setupKey,
  ScriptedDuplex,
  snapshotMessages,
  sourceBoundWire,
  vector
} from './ticket-workspace-resident-test-peer'
import { connectTicketWorkspaceResidentSourceAdapter } from './ticket-workspace-resident-source-adapter'
import { TicketWorkspaceResidentHighWater } from './ticket-workspace-resident-high-water'
import { MemoryResidentSourceHighWaterStore } from './ticket-workspace-resident-high-water-test-store'

describe('resident source adapter', () => {
  it('captures its own lease and monotonic read evidence and exposes only the presented current baseline', async () => {
    const now = 8_000
    let displayedRevision: string | null = null
    const value = snapshot()
    const { source } = await connectSource(
      [value],
      () => now,
      () => 0,
      () => displayedRevision
    )

    const read = await source.readCurrentSnapshot(new AbortController().signal, 2_500)
    expect(read).not.toBeNull()
    if (!read) {
      return
    }
    expect(read.evidence).toMatchObject({
      binding,
      ledgerEpoch: 'epoch-a',
      connectionIncarnation: vector.inputs.connectionIncarnation,
      readStartedAtMonotonicMs: 8_000,
      source: value.source
    })
    expect(source.isCurrent(read)).toBe(true)
    expect(source.getDisplayedBaseline(value.snapshotRevision)).toBeNull()

    displayedRevision = value.snapshotRevision
    expect(source.presentSnapshot(read)).toBe(true)
    expect(source.getDisplayedBaseline(value.snapshotRevision)).toEqual(read.snapshot)
    displayedRevision = 'another-view'
    expect(source.getDisplayedBaseline(value.snapshotRevision)).toBeNull()
    source.close()
    expect(source.isCurrent(read)).toBe(false)
    expect(source.getDisplayedBaseline(value.snapshotRevision)).toBeNull()
  })

  it('preserves an earlier token and displayed baseline across timestamp-only rereads', async () => {
    let displayedRevision: string | null = null
    const initial = snapshot({ generatedAt: '1900-01-01T00:00:00.000Z' })
    const regenerated = snapshot({ generatedAt: '2100-01-01T00:00:00.000Z' })
    const { source } = await connectSource(
      [initial, regenerated],
      () => 100,
      () => 0,
      () => displayedRevision
    )

    const first = await source.readCurrentSnapshot(new AbortController().signal, 5_000)
    expect(first).not.toBeNull()
    if (!first) {
      return
    }
    displayedRevision = initial.snapshotRevision
    expect(source.presentSnapshot(first)).toBe(true)
    const second = await source.readCurrentSnapshot(new AbortController().signal, 5_000)
    expect(second).not.toBeNull()
    if (!second) {
      return
    }
    expect(second.snapshot.snapshotRevision).not.toBe(first.snapshot.snapshotRevision)
    expect(source.isCurrent(first)).toBe(true)
    expect(source.getDisplayedBaseline(initial.snapshotRevision)).toEqual(first.snapshot)
    expect(source.getDisplayedBaseline(regenerated.snapshotRevision)).toBeNull()

    displayedRevision = regenerated.snapshotRevision
    expect(source.presentSnapshot(second)).toBe(true)
    expect(source.getDisplayedBaseline(regenerated.snapshotRevision)).toEqual(second.snapshot)
    source.close()
  })

  it('revokes earlier tokens when source order advances', async () => {
    let displayedRevision: string | null = null
    const initial = snapshot()
    const newer = snapshot({ ledgerRevision: 8, catalogDigest: 'b'.repeat(64) })
    const { source } = await connectSource(
      [initial, newer],
      () => 100,
      () => 0,
      () => displayedRevision
    )
    const first = await source.readCurrentSnapshot(new AbortController().signal, 5_000)
    expect(first).not.toBeNull()
    if (!first) {
      return
    }
    displayedRevision = initial.snapshotRevision
    expect(source.presentSnapshot(first)).toBe(true)
    const second = await source.readCurrentSnapshot(new AbortController().signal, 5_000)
    expect(second).not.toBeNull()
    if (!second) {
      return
    }
    expect(source.isCurrent(first)).toBe(false)
    expect(source.getDisplayedBaseline(initial.snapshotRevision)).toBeNull()
    displayedRevision = newer.snapshotRevision
    expect(source.presentSnapshot(second)).toBe(true)
    expect(source.getDisplayedBaseline(newer.snapshotRevision)).toEqual(second.snapshot)
    source.close()
  })

  it('expires at the host monotonic TTL and invalidates on suspend or clock rollback', async () => {
    let now = 100
    let suspendGeneration = 0
    const ttlSnapshot = snapshot()
    const ttl = await connectSource(
      [ttlSnapshot, ttlSnapshot],
      () => now,
      () => suspendGeneration,
      () => ttlSnapshot.snapshotRevision
    )
    const ttlRead = await ttl.source.readCurrentSnapshot(new AbortController().signal, 5_000)
    expect(ttlRead).not.toBeNull()
    expect(ttlRead && ttl.source.presentSnapshot(ttlRead)).toBe(true)
    now += 30_000
    expect(ttlRead && ttl.source.isCurrent(ttlRead)).toBe(false)
    expect(ttl.source.getDisplayedBaseline(ttlSnapshot.snapshotRevision)).toBeNull()
    const refreshed = await ttl.source.readCurrentSnapshot(new AbortController().signal, 5_000)
    expect(refreshed).not.toBeNull()
    expect(ttl.source.getDisplayedBaseline(ttlSnapshot.snapshotRevision)).toBeNull()
    expect(refreshed && ttl.source.presentSnapshot(refreshed)).toBe(true)
    expect(ttl.source.getDisplayedBaseline(ttlSnapshot.snapshotRevision)).toEqual(ttlSnapshot)
    ttl.source.close()

    now = 1_000
    const suspendSnapshot = snapshot()
    const suspend = await connectSource(
      [suspendSnapshot],
      () => now,
      () => suspendGeneration,
      () => suspendSnapshot.snapshotRevision
    )
    const suspendRead = await suspend.source.readCurrentSnapshot(
      new AbortController().signal,
      5_000
    )
    expect(suspendRead).not.toBeNull()
    suspendGeneration += 1
    now += 1
    expect(suspendRead && suspend.source.isCurrent(suspendRead)).toBe(false)
    suspend.source.close()

    now = 2_000
    const rollbackSnapshot = snapshot()
    const rollback = await connectSource(
      [rollbackSnapshot],
      () => now,
      () => suspendGeneration,
      () => rollbackSnapshot.snapshotRevision
    )
    const rollbackRead = await rollback.source.readCurrentSnapshot(
      new AbortController().signal,
      5_000
    )
    expect(rollbackRead).not.toBeNull()
    now -= 1
    expect(rollbackRead && rollback.source.isCurrent(rollbackRead)).toBe(false)
    rollback.source.close()
  })

  it('rejects a valid unsupported whole snapshot before reading or advancing high-water', async () => {
    const unsupported = snapshot({ unsupportedTicket: true })
    const store = new MemoryResidentSourceHighWaterStore()
    const { source } = await connectSource(
      [unsupported],
      () => 100,
      () => 0,
      () => unsupported.snapshotRevision,
      store
    )

    await expect(
      source.readCurrentSnapshot(new AbortController().signal, 5_000)
    ).resolves.toBeNull()
    expect(store.readCounts.size).toBe(0)
    expect(store.compareCandidates).toHaveLength(0)
    source.close()
  })

  it('keeps a retired or changed presentation from retaining a baseline', async () => {
    let displayedRevision: string | null = null
    const value = snapshot()
    const { source } = await connectSource(
      [value],
      () => 100,
      () => 0,
      () => displayedRevision
    )
    const read = await source.readCurrentSnapshot(new AbortController().signal, 5_000)
    expect(read).not.toBeNull()
    if (!read) {
      return
    }
    displayedRevision = value.snapshotRevision
    expect(source.presentSnapshot(read)).toBe(true)
    expect(source.getDisplayedBaseline(value.snapshotRevision)).toEqual(read.snapshot)
    displayedRevision = null
    expect(source.getDisplayedBaseline(value.snapshotRevision)).toBeNull()
    source.close()
  })

  it('does not commit a source that expires during a high-water store read', async () => {
    let now = 100
    const value = snapshot()
    const store = new MemoryResidentSourceHighWaterStore()
    const { source } = await connectSource(
      [value],
      () => now,
      () => 0,
      () => value.snapshotRevision,
      store
    )
    store.beforeRead = async () => {
      now = 30_100
    }

    await expect(
      source.readCurrentSnapshot(new AbortController().signal, 5_000)
    ).resolves.toBeNull()
    expect(store.compareCandidates).toHaveLength(0)
    source.close()
  })

  it('checks host TTL immediately before the atomic high-water mutation', async () => {
    let now = 100
    const value = snapshot()
    const store = new MemoryResidentSourceHighWaterStore()
    const { source } = await connectSource(
      [value],
      () => now,
      () => 0,
      () => value.snapshotRevision,
      store
    )
    store.beforeCompare = async () => {
      now = 30_100
    }

    await expect(
      source.readCurrentSnapshot(new AbortController().signal, 5_000)
    ).resolves.toBeNull()
    expect(store.compareCandidates).toHaveLength(1)
    expect(store.committedCandidates).toHaveLength(0)
    source.close()
  })

  it('does not commit a source when the caller aborts during a store read', async () => {
    const value = snapshot()
    const store = new MemoryResidentSourceHighWaterStore()
    const controller = new AbortController()
    const { source } = await connectSource(
      [value],
      () => 100,
      () => 0,
      () => value.snapshotRevision,
      store
    )
    store.beforeRead = async () => {
      controller.abort()
    }

    await expect(source.readCurrentSnapshot(controller.signal, 5_000)).resolves.toBeNull()
    expect(store.compareCandidates).toHaveLength(0)
    expect(store.committedCandidates).toHaveLength(0)
    source.close()
  })

  it('settles a stalled high-water write at the caller budget and blocks its late commit', async () => {
    const value = snapshot()
    const store = new MemoryResidentSourceHighWaterStore()
    const { source } = await connectSource(
      [value],
      () => 100,
      () => 0,
      () => value.snapshotRevision,
      store
    )
    let markCompareStarted = (): void => undefined
    const compareStarted = new Promise<void>((resolve) => {
      markCompareStarted = resolve
    })
    let releaseCompare = (): void => undefined
    const compareGate = new Promise<void>((resolve) => {
      releaseCompare = resolve
    })
    let markCompareFinished = (): void => undefined
    const compareFinished = new Promise<void>((resolve) => {
      markCompareFinished = resolve
    })
    store.beforeCompare = async () => {
      markCompareStarted()
      await compareGate
    }
    store.afterCompare = markCompareFinished
    const pending = source.readCurrentSnapshot(new AbortController().signal, 25)
    await compareStarted
    await expect(pending).resolves.toBeNull()
    releaseCompare()
    await compareFinished
    await Promise.resolve()
    expect(store.committedCandidates).toHaveLength(0)
    source.close()
  })
})

type SnapshotChanges = Readonly<{
  catalogDigest?: string
  generatedAt?: string
  ledgerRevision?: number
  unsupportedTicket?: boolean
}>

function snapshot(changes: SnapshotChanges = {}): TicketNavigatorSnapshotV1 {
  const value: TicketNavigatorSnapshotV1 = {
    schemaId: 'ticket-navigator-snapshot',
    schemaVersion: 1,
    producer: {
      name: 'ticket-workspace',
      version: binding.expectedService.releaseId,
      contractVersion: 1
    },
    profile: { ...binding.profile },
    generatedAt: changes.generatedAt ?? '2026-01-01T00:00:00.000Z',
    staleAfter: changes.generatedAt
      ? new Date(Date.parse(changes.generatedAt) + 60_000).toISOString()
      : '2026-01-01T00:01:00.000Z',
    snapshotRevision: '0'.repeat(64),
    source: {
      authorityId: binding.authorityId,
      ledgerEpoch: 'epoch-a',
      ledgerRevision: changes.ledgerRevision ?? 7,
      projectionSequence: 0,
      catalogDigest: changes.catalogDigest ?? 'a'.repeat(64)
    },
    tickets:
      changes.unsupportedTicket === true
        ? [
            {
              ticketKey: 'SEL-1',
              label: 'Unsupported ticket',
              lifecycle: 'ready',
              availability: 'unsupported',
              orchestration: {
                executionHostId: 'wsl:machine-a:distro-a',
                runId: 'run-1',
                dispatchIds: [],
                requestIds: []
              },
              enrichment: { issue: 'unknown', mergeRequests: 'unknown' },
              workspaces: [],
              actions: []
            }
          ]
        : []
  }
  return { ...value, snapshotRevision: digestNavigatorSnapshotV1(value) }
}

async function connectSource(
  snapshots: TicketNavigatorSnapshotV1[],
  now: () => number,
  suspendGeneration: () => number,
  getDisplayedSnapshotRevision: () => string | null,
  store = new MemoryResidentSourceHighWaterStore()
) {
  let sequence = 1
  let nextSnapshotIndex = 0
  const duplex = new ScriptedDuplex((index, frame, push) => {
    if (index === 0) {
      push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
    }
    if (index === 2) {
      push(sourceBoundWire)
    }
    if (index >= 3) {
      const value = snapshots[nextSnapshotIndex]
      if (!value) {
        throw new Error('No synthetic resident snapshot remains')
      }
      nextSnapshotIndex += 1
      const frames = protectedFrames(
        snapshotMessages(
          Buffer.from(serializeTicketNavigatorSnapshotUtf8V1(value), 'utf8'),
          parseProtectedRequestId(frame)
        ),
        sequence
      )
      sequence += frames.length
      for (const frame of frames) {
        push(frame)
      }
    }
  })
  const highWater = new TicketWorkspaceResidentHighWater(store, {
    authorizeFirstAdoption: async () => true,
    authorizeRebind: async () => true,
    authorizeRecovery: async () => true
  })
  const connected = await connectTicketWorkspaceResidentSourceAdapter({
    duplex,
    setupKey,
    expectedBinding: binding,
    highWater,
    clock: { now, suspendGeneration },
    getDisplayedSnapshotRevision,
    randomBytes: randomSource()
  })
  if (connected.status !== 'connected') {
    throw new Error(`Resident source setup failed: ${connected.reason}`)
  }
  return { source: connected.source, duplex, store }
}
