import { describe, expect, it, vi } from 'vitest'
import {
  binding,
  randomSource,
  setupKey,
  ScriptedDuplex,
  sourceBoundWire,
  vector
} from './ticket-workspace-resident-test-peer'
import {
  connectSource,
  snapshot,
  sourceLeaseIdentity
} from './ticket-workspace-resident-source-adapter-test-fixture'
import { connectTicketWorkspaceResidentSourceAdapter } from './ticket-workspace-resident-source-adapter'
import {
  createResidentSourceHighWaterKey,
  TicketWorkspaceResidentHighWater,
  type ResidentHighWaterOperationContext
} from './ticket-workspace-resident-high-water'
import { MemoryResidentSourceHighWaterStore } from './ticket-workspace-resident-high-water-test-store'

describe('resident source adapter', () => {
  it('keeps the nullable read as a single delegated operation and floors its original lifetime', async () => {
    let now = 8_000
    const value = snapshot()
    const { source } = await connectSource(
      [value],
      () => now,
      () => 0,
      () => null
    )
    const detailedRead = vi.spyOn(source, 'readCurrentPresentationSnapshot')

    const read = await source.readCurrentSnapshot(new AbortController().signal, 2_500)
    expect(read).not.toBeNull()
    expect(detailedRead).toHaveBeenCalledTimes(1)
    if (!read) {
      return
    }

    expect(source.getCurrentnessRemainingMs(read)).toBe(30_000)
    now = 37_999.5
    expect(source.getCurrentnessRemainingMs(read)).toBe(0)
    expect(source.isCurrent(read)).toBe(true)
    now = 38_000
    expect(source.getCurrentnessRemainingMs(read)).toBe(0)
    expect(source.isCurrent(read)).toBe(false)
    source.close()
  })

  it('requires its final lease stamp before reporting unsupported and revokes old currentness', async () => {
    const connected = await connectSource(
      [snapshot(), snapshot({ unsupportedTicket: true }), snapshot({ unsupportedTicket: true })],
      () => 100,
      () => 0,
      () => null
    )
    const admitted = await connected.source.readCurrentPresentationSnapshot(
      new AbortController().signal,
      5_000
    )
    if (admitted.status !== 'admitted') {
      throw new Error('Expected an admitted source read')
    }
    const readsBeforeUnsupported = [...connected.store.readCounts.values()]
    const comparesBeforeUnsupported = connected.store.compareCandidates.length
    expect(connected.source.isCurrent(admitted.read)).toBe(true)

    await expect(
      connected.source.readCurrentPresentationSnapshot(new AbortController().signal, 5_000)
    ).resolves.toEqual({ status: 'unsupported' })
    expect(connected.source.isCurrent(admitted.read)).toBe(false)
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const leaseGeneration = connected.highWater.registerLease(key, sourceLeaseIdentity())
    const originalIsLeaseCurrent = connected.highWater.isLeaseCurrent.bind(connected.highWater)
    let checks = 0
    vi.spyOn(connected.highWater, 'isLeaseCurrent').mockImplementation(
      (checkedKey, checkedGeneration, invalidationGeneration) => {
        checks += 1
        if (checks === 2) {
          connected.highWater.invalidateLease(key, leaseGeneration)
        }
        return originalIsLeaseCurrent(checkedKey, checkedGeneration, invalidationGeneration)
      }
    )

    await expect(
      connected.source.readCurrentPresentationSnapshot(new AbortController().signal, 5_000)
    ).resolves.toEqual({ status: 'unavailable' })
    expect([...connected.store.readCounts.values()]).toEqual(readsBeforeUnsupported)
    expect(connected.store.compareCandidates).toHaveLength(comparesBeforeUnsupported)
    connected.source.close()
  })

  it('rejects a lease invalidated while the authenticated transport read is in flight', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const connected = await connectSource(
      [snapshot()],
      () => 100,
      () => 0,
      () => null,
      store,
      (highWater) => {
        const leaseGeneration = highWater.registerLease(key, sourceLeaseIdentity())
        highWater.invalidateLease(key, leaseGeneration)
      }
    )

    await expect(
      connected.source.readCurrentPresentationSnapshot(new AbortController().signal, 5_000)
    ).resolves.toEqual({ status: 'unavailable' })
    expect(store.readCounts.size).toBe(0)
    expect(store.compareCandidates).toHaveLength(0)
    connected.source.close()
  })

  it('rejects a lease invalidated during a raw HWM read before candidate publication', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const connected = await connectSource(
      [snapshot()],
      () => 100,
      () => 0,
      () => null,
      store
    )
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const leaseGeneration = connected.highWater.registerLease(key, sourceLeaseIdentity())
    store.beforeRead = async () => {
      connected.highWater.invalidateLease(key, leaseGeneration)
    }

    await expect(
      connected.source.readCurrentPresentationSnapshot(new AbortController().signal, 5_000)
    ).resolves.toEqual({ status: 'unavailable' })
    expect(store.compareCandidates).toHaveLength(0)
    expect(store.committedCandidates).toHaveLength(0)
    connected.source.close()
  })

  it('keeps the original lease stamp across an admission queued behind raw storage', async () => {
    const value = snapshot()
    const store = new MemoryResidentSourceHighWaterStore()
    const connected = await connectSource(
      [value, value],
      () => 100,
      () => 0,
      () => null,
      store
    )
    const first = await connected.source.readCurrentPresentationSnapshot(
      new AbortController().signal,
      5_000
    )
    expect(first.status).toBe('admitted')
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const leaseGeneration = connected.highWater.registerLease(key, sourceLeaseIdentity())

    let markReadStarted = (): void => undefined
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve
    })
    let releaseRead = (): void => undefined
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    store.beforeRead = async () => {
      markReadStarted()
      await readGate
    }
    const active = connected.highWater.admit(
      key,
      {
        ledgerRevision: value.source.ledgerRevision,
        projectionSequence: value.source.projectionSequence,
        catalogDigest: value.source.catalogDigest
      },
      leaseGeneration
    )
    await readStarted

    let markAdmissionQueued = (): void => undefined
    const admissionQueued = new Promise<void>((resolve) => {
      markAdmissionQueued = resolve
    })
    const originalAdmit = connected.highWater.admit.bind(connected.highWater)
    vi.spyOn(connected.highWater, 'admit').mockImplementation(
      (admissionKey, candidate, generation, canContinue, context) => {
        if (context) {
          markAdmissionQueued()
        }
        return originalAdmit(admissionKey, candidate, generation, canContinue, context)
      }
    )
    const nextWriteCount = connected.duplex.writes.length + 1
    const pending = connected.source.readCurrentPresentationSnapshot(
      new AbortController().signal,
      5_000
    )
    await connected.duplex.waitForWriteCount(nextWriteCount)
    await admissionQueued
    connected.highWater.invalidateLease(key, leaseGeneration)
    releaseRead()

    await expect(pending).resolves.toEqual({ status: 'unavailable' })
    await expect(active).resolves.toMatchObject({ status: 'unavailable' })
    expect([...store.readCounts.values()]).toEqual([3])
    expect(store.compareCandidates).toHaveLength(1)
    connected.source.close()
  })

  it('rejects a candidate invalidated at the adapter terminal check after helper settlement', async () => {
    const connected = await connectSource(
      [snapshot()],
      () => 100,
      () => 0,
      () => null
    )
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const leaseGeneration = connected.highWater.registerLease(key, sourceLeaseIdentity())
    const originalIsCurrent = connected.highWater.isCurrent.bind(connected.highWater)
    vi.spyOn(connected.highWater, 'isCurrent').mockImplementation((facts) => {
      connected.highWater.invalidateLease(key, leaseGeneration)
      return originalIsCurrent(facts)
    })

    await expect(
      connected.source.readCurrentPresentationSnapshot(new AbortController().signal, 5_000)
    ).resolves.toEqual({ status: 'unavailable' })
    expect(connected.store.committedCandidates).toHaveLength(1)
    connected.source.close()
  })

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

  it('checks the synchronous registration guard before the adapter constructor can register HWM', async () => {
    const duplex = new ScriptedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
    })
    const highWater = new TicketWorkspaceResidentHighWater(
      new MemoryResidentSourceHighWaterStore(),
      {
        authorizeFirstAdoption: async () => true,
        authorizeRebind: async () => true,
        authorizeRecovery: async () => true
      }
    )
    const registerLease = vi.spyOn(highWater, 'registerLease')
    const connected = await connectTicketWorkspaceResidentSourceAdapter({
      duplex,
      setupKey,
      expectedBinding: binding,
      highWater,
      clock: { now: () => 100, suspendGeneration: () => 0 },
      getDisplayedSnapshotRevision: () => null,
      canRegisterLease: () => false,
      randomBytes: randomSource()
    })

    expect(connected).toEqual({ status: 'unavailable', reason: 'deadline_exceeded' })
    expect(registerLease).not.toHaveBeenCalled()
    expect(duplex.destroyed).toBe(true)
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

  it('uses the original read budget after transport time and removes an expired queued admission', async () => {
    let now = 100
    const value = snapshot()
    const store = new MemoryResidentSourceHighWaterStore()
    const connected = await connectSource(
      [value],
      () => now,
      () => 0,
      () => null,
      store,
      () => {
        now = 900
      }
    )
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const leaseIdentity = JSON.stringify([
      binding.expectedService.releaseId,
      binding.expectedService.artifactSha256,
      vector.inputs.connectionIncarnation
    ])
    const lease = connected.highWater.registerLease(key, leaseIdentity)
    let markReadStarted = (): void => undefined
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve
    })
    let releaseRead = (): void => undefined
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    store.beforeRead = async () => {
      markReadStarted()
      await readGate
    }
    const active = connected.highWater.admit(
      key,
      {
        ledgerRevision: value.source.ledgerRevision,
        projectionSequence: value.source.projectionSequence,
        catalogDigest: value.source.catalogDigest
      },
      lease
    )
    await readStarted

    let capturedContext: ResidentHighWaterOperationContext | undefined
    let markContextCaptured = (): void => undefined
    const contextCaptured = new Promise<void>((resolve) => {
      markContextCaptured = resolve
    })
    const originalAdmit = connected.highWater.admit.bind(connected.highWater)
    vi.spyOn(connected.highWater, 'admit').mockImplementation(
      (admissionKey, candidate, leaseGeneration, canContinue, context) => {
        if (context) {
          capturedContext = context
          markContextCaptured()
        }
        return originalAdmit(admissionKey, candidate, leaseGeneration, canContinue, context)
      }
    )
    const pendingRead = connected.source.readCurrentSnapshot(new AbortController().signal, 1_000)
    await contextCaptured
    expect(capturedContext?.remainingBudgetMs()).toBe(200)
    now = 1_100
    expect(capturedContext?.isActive()).toBe(false)
    await expect(pendingRead).resolves.toBeNull()
    expect([...store.readCounts.values()]).toEqual([1])
    expect(store.quarantinedReasons).toHaveLength(0)

    releaseRead()
    await expect(active).resolves.toMatchObject({ status: 'unavailable' })
    expect(store.compareCandidates).toHaveLength(0)
    connected.source.close()
  })

  it('keeps a timed-out high-water read in its key slot until raw storage settles', async () => {
    const value = snapshot()
    const store = new MemoryResidentSourceHighWaterStore()
    const connected = await connectSource(
      [value, value],
      () => 100,
      () => 0,
      () => null,
      store
    )
    let markReadStarted = (): void => undefined
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve
    })
    let releaseRead = (): void => undefined
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    let blockFirstRead = true
    store.beforeRead = async () => {
      if (blockFirstRead) {
        blockFirstRead = false
        markReadStarted()
        await readGate
      }
    }

    const first = connected.source.readCurrentSnapshot(new AbortController().signal, 40)
    await readStarted
    await expect(first).resolves.toBeNull()

    let markAdmissionQueued = (): void => undefined
    const admissionQueued = new Promise<void>((resolve) => {
      markAdmissionQueued = resolve
    })
    const originalAdmit = connected.highWater.admit.bind(connected.highWater)
    vi.spyOn(connected.highWater, 'admit').mockImplementation(
      (key, candidate, leaseGeneration, canContinue, context) => {
        if (context) {
          markAdmissionQueued()
        }
        return originalAdmit(key, candidate, leaseGeneration, canContinue, context)
      }
    )
    const nextWriteCount = connected.duplex.writes.length + 1
    const second = connected.source.readCurrentSnapshot(new AbortController().signal, 1_000)
    await connected.duplex.waitForWriteCount(nextWriteCount)
    await admissionQueued
    expect([...store.readCounts.values()]).toEqual([1])
    releaseRead()

    const current = await second
    expect(current).not.toBeNull()
    expect([...store.readCounts.values()]).toEqual([3])
    expect(store.compareCandidates).toHaveLength(1)
    expect(store.quarantinedReasons).toHaveLength(0)
    connected.source.close()
  })
})
