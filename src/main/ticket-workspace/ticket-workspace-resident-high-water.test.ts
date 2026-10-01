import { describe, expect, it } from 'vitest'
import { binding } from './ticket-workspace-resident-test-peer'
import { ResidentHighWaterOperationContext } from './ticket-workspace-resident-high-water-operation-context'
import {
  createResidentSourceBaseKey,
  createResidentSourceHighWaterKey,
  TicketWorkspaceResidentHighWater,
  type ResidentSourceHighWaterPermissions,
  type ResidentSourceHighWaterRecord
} from './ticket-workspace-resident-high-water'
import { MemoryResidentSourceHighWaterStore } from './ticket-workspace-resident-high-water-test-store'
import { waitForResidentSourceAdmission } from './ticket-workspace-resident-source-admission-wait'

describe('resident source high-water admission', () => {
  it('requires explicit first adoption and does not bootstrap from an absent row alone', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions(false))
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')

    await expect(manager.admit(key, record(7, 'a'), lease)).resolves.toEqual({
      status: 'unavailable',
      reason: 'initial_adoption_required'
    })
    expect(store.compareCandidates).toHaveLength(0)
  })

  it('commits first adoption before positive admission, then accepts same-source observations stably', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    const first = await manager.admit(key, record(7, 'a'), lease)

    expect(first.status).toBe('admitted')
    expect(store.compareCandidates).toHaveLength(1)
    if (first.status !== 'admitted') {
      return
    }
    const equal = await manager.admit(key, record(7, 'a'), lease)
    expect(equal.status).toBe('admitted')
    if (equal.status === 'admitted') {
      expect(equal.facts).toMatchObject({
        revisionGeneration: first.facts.revisionGeneration,
        invalidationGeneration: first.facts.invalidationGeneration,
        quarantineGeneration: first.facts.quarantineGeneration
      })
      expect(manager.isCurrent(first.facts)).toBe(true)
    }
    expect(store.compareCandidates).toHaveLength(1)
  })

  it('restores an existing source row after restart without first-adoption authority', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const firstProcess = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const firstLease = firstProcess.registerLease(key, 'lease-first')
    expect((await firstProcess.admit(key, record(7, 'a'), firstLease)).status).toBe('admitted')

    const restarted = new TicketWorkspaceResidentHighWater(store, permissions(false))
    const restartedLease = restarted.registerLease(key, 'lease-restarted')
    await expect(restarted.admit(key, record(7, 'a'), restartedLease)).resolves.toMatchObject({
      status: 'admitted'
    })
  })

  it('advances only a greater tuple and revokes older source tokens', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    const first = await manager.admit(key, record(7, 'a'), lease)
    if (first.status !== 'admitted') {
      throw new Error('Initial source was not admitted')
    }

    const newer = await manager.admit(key, record(8, 'b'), lease)
    expect(newer.status).toBe('admitted')
    expect(manager.isCurrent(first.facts)).toBe(false)
    if (newer.status === 'admitted') {
      expect(manager.isCurrent(newer.facts)).toBe(true)
    }
    expect(store.compareCandidates).toHaveLength(2)
  })

  it('quarantines regression and equal-tuple digest equivocation', async () => {
    for (const [candidate, expectedReason] of [
      [record(6, 'a'), 'source_revision_regression'],
      [record(7, 'different'), 'source_equivocation']
    ] as const) {
      const store = new MemoryResidentSourceHighWaterStore()
      const manager = new TicketWorkspaceResidentHighWater(store, permissions())
      const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
      const lease = manager.registerLease(key, 'lease-a')
      const first = await manager.admit(key, record(7, 'a'), lease)
      expect(first.status).toBe('admitted')

      await expect(manager.admit(key, candidate, lease)).resolves.toEqual({
        status: 'unavailable',
        reason: expectedReason
      })
      expect(store.quarantinedReasons).toContain(expectedReason)
      if (first.status === 'admitted') {
        expect(manager.isCurrent(first.facts)).toBe(false)
      }
    }
  })

  it('retries a CAS conflict and fails closed after unresolved or failed CAS', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    store.conflictNextCompare = 1
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    await expect(manager.admit(key, record(7, 'a'), lease)).resolves.toMatchObject({
      status: 'admitted'
    })
    expect(store.compareCandidates).toHaveLength(2)

    const unresolvedStore = new MemoryResidentSourceHighWaterStore()
    unresolvedStore.conflictNextCompare = 10
    const unresolved = new TicketWorkspaceResidentHighWater(unresolvedStore, permissions())
    const unresolvedLease = unresolved.registerLease(key, 'lease-b')
    await expect(unresolved.admit(key, record(7, 'a'), unresolvedLease)).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_storage_failure'
    })
    expect(unresolvedStore.quarantinedReasons).toContain('high_water_storage_failure')

    const failedStore = new MemoryResidentSourceHighWaterStore()
    const failed = new TicketWorkspaceResidentHighWater(failedStore, permissions())
    const failedLease = failed.registerLease(key, 'lease-c')
    const prior = await failed.admit(key, record(7, 'a'), failedLease)
    expect(prior.status).toBe('admitted')
    failedStore.failCompare = true
    await expect(failed.admit(key, record(8, 'b'), failedLease)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'high_water_storage_failure'
    })
    expect(failedStore.quarantinedReasons).toContain('high_water_storage_failure')
    if (prior.status === 'admitted') {
      expect(failed.isCurrent(prior.facts)).toBe(false)
    }

    const rejectedStore = new MemoryResidentSourceHighWaterStore()
    const rejected = new TicketWorkspaceResidentHighWater(rejectedStore, permissions())
    const rejectedLease = rejected.registerLease(key, 'lease-rejected')
    const accepted = await rejected.admit(key, record(7, 'a'), rejectedLease)
    expect(accepted.status).toBe('admitted')
    rejectedStore.throwCompare = true
    await expect(rejected.admit(key, record(8, 'b'), rejectedLease)).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_storage_failure'
    })
    if (accepted.status === 'admitted') {
      expect(rejected.isCurrent(accepted.facts)).toBe(false)
    }
    expect(rejectedStore.quarantinedReasons).toContain('high_water_storage_failure')
  })

  it('does not admit a read whose lease changes while storage is pending', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    const first = await manager.admit(key, record(7, 'a'), lease)
    if (first.status !== 'admitted') {
      throw new Error('Initial source was not admitted')
    }

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
    const pending = manager.admit(key, record(7, 'a'), lease)
    await readStarted
    manager.registerLease(key, 'lease-b')
    releaseRead()

    await expect(pending).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_quarantined'
    })
    expect(manager.isCurrent(first.facts)).toBe(false)
  })

  it('does not remint a current token after same-lease invalidation during storage wait', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    const first = await manager.admit(key, record(7, 'a'), lease)
    if (first.status !== 'admitted') {
      throw new Error('Initial source was not admitted')
    }

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
    const pending = manager.admit(key, record(7, 'a'), lease)
    await readStarted
    manager.invalidateLease(key, lease)
    releaseRead()

    await expect(pending).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_quarantined'
    })
    expect(manager.isCurrent(first.facts)).toBe(false)
  })

  it('does not let ordinary reconnect reactivate an epoch retired by rebind', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const oldKey = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const oldLease = manager.registerLease(oldKey, 'lease-old')
    const first = await manager.admit(oldKey, record(7, 'a'), oldLease)
    expect(first.status).toBe('admitted')

    expect(await manager.rebind(createResidentSourceBaseKey(binding), 'epoch-a', 'epoch-b')).toBe(
      'rebound'
    )
    const reconnectLease = manager.registerLease(oldKey, 'ordinary-reconnect')
    await expect(manager.admit(oldKey, record(7, 'a'), reconnectLease)).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_quarantined'
    })
    expect(store.quarantinedReasons).toHaveLength(0)
    if (first.status === 'admitted') {
      expect(manager.isCurrent(first.facts)).toBe(false)
    }
  })

  it('blocks old-epoch reads while explicit rebind storage is pending', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const oldKey = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const oldLease = manager.registerLease(oldKey, 'lease-old')
    expect((await manager.admit(oldKey, record(7, 'a'), oldLease)).status).toBe('admitted')

    let markRebindStarted = (): void => undefined
    const rebindStarted = new Promise<void>((resolve) => {
      markRebindStarted = resolve
    })
    let releaseRebind = (): void => undefined
    const rebindGate = new Promise<void>((resolve) => {
      releaseRebind = resolve
    })
    store.beforeRebind = async () => {
      markRebindStarted()
      await rebindGate
    }
    const rebind = manager.rebind(createResidentSourceBaseKey(binding), 'epoch-a', 'epoch-b')
    await rebindStarted
    const reconnectLease = manager.registerLease(oldKey, 'reconnect-during-rebind')
    await expect(manager.admit(oldKey, record(7, 'a'), reconnectLease)).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_quarantined'
    })
    releaseRebind()
    await expect(rebind).resolves.toBe('rebound')
  })

  it('cannot overwrite quarantine during delayed first-adoption permission', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    let allowAdoption = (): void => undefined
    let markPermissionStarted = (): void => undefined
    const permissionStarted = new Promise<void>((resolve) => {
      markPermissionStarted = resolve
    })
    const permissionGate = new Promise<void>((resolve) => {
      allowAdoption = resolve
    })
    const manager = new TicketWorkspaceResidentHighWater(store, {
      ...permissions(),
      authorizeFirstAdoption: async () => {
        markPermissionStarted()
        await permissionGate
        return true
      }
    })
    const lease = manager.registerLease(key, 'lease-a')
    const pending = manager.admit(key, record(7, 'a'), lease)
    await permissionStarted
    await manager.quarantine(key, 'source_equivocation')
    allowAdoption()

    await expect(pending).resolves.toMatchObject({ status: 'unavailable' })
    const restarted = new TicketWorkspaceResidentHighWater(store, permissions())
    const restartedLease = restarted.registerLease(key, 'lease-restarted')
    await expect(restarted.admit(key, record(7, 'a'), restartedLease)).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_quarantined'
    })
  })

  it('quarantines read failures and missing or corrupt known history', async () => {
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const failedStore = new MemoryResidentSourceHighWaterStore()
    failedStore.failReads = true
    const failed = new TicketWorkspaceResidentHighWater(failedStore, permissions())
    const failedLease = failed.registerLease(key, 'lease-a')
    await expect(failed.admit(key, record(7, 'a'), failedLease)).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_storage_failure'
    })

    const lostStore = new MemoryResidentSourceHighWaterStore()
    lostStore.seed(key, record(7, 'a'))
    lostStore.markMissingOrCorrupt(key)
    const lost = new TicketWorkspaceResidentHighWater(lostStore, permissions())
    const lostLease = lost.registerLease(key, 'lease-b')
    await expect(lost.admit(key, record(8, 'b'), lostLease)).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_history_lost'
    })
  })

  it('preserves high-water across service update or rollback lease identities', async () => {
    const updatedBinding = {
      ...binding,
      expectedService: {
        ...binding.expectedService,
        releaseId: 'release-updated',
        artifactSha256: 'b'.repeat(64)
      }
    }
    const rollbackBinding = {
      ...binding,
      expectedService: {
        ...binding.expectedService,
        releaseId: 'release-rollback',
        artifactSha256: 'c'.repeat(64)
      }
    }
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    expect(createResidentSourceHighWaterKey(updatedBinding, 'epoch-a')).toEqual(key)
    expect(createResidentSourceHighWaterKey(rollbackBinding, 'epoch-a')).toEqual(key)

    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const lease = manager.registerLease(key, 'release-updated:inc-2')
    expect((await manager.admit(key, record(7, 'a'), lease)).status).toBe('admitted')
    manager.registerLease(
      createResidentSourceHighWaterKey(rollbackBinding, 'epoch-a'),
      'release-rollback:inc-3'
    )
    const rollbackLease = manager.registerLease(key, 'release-rollback:inc-3')
    await expect(manager.admit(key, record(6, 'a'), rollbackLease)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'source_revision_regression'
    })
  })

  it('caps active and queued admissions by exact key across lease generations', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const oldLease = manager.registerLease(key, 'lease-old')
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

    const active = manager.admit(key, record(7, 'a'), oldLease)
    await readStarted
    const queuedOld = Array.from({ length: 6 }, () => manager.admit(key, record(7, 'a'), oldLease))
    const newLease = manager.registerLease(key, 'lease-new')
    const queuedNew = manager.admit(key, record(7, 'a'), newLease)
    await expect(manager.admit(key, record(7, 'a'), newLease)).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_admission_capacity'
    })
    expect([...store.readCounts.values()]).toEqual([1])
    expect(store.quarantinedReasons).toHaveLength(0)

    releaseRead()
    await expect(active).resolves.toMatchObject({ status: 'unavailable' })
    const queuedResults = await Promise.all([...queuedOld, queuedNew])
    expect(queuedResults.slice(0, 6)).toEqual(
      Array.from({ length: 6 }, () => ({ status: 'unavailable', reason: 'high_water_quarantined' }))
    )
    expect(queuedResults[6].status).toBe('admitted')
    expect(store.compareCandidates).toHaveLength(1)
    expect(store.quarantinedReasons).toHaveLength(0)
  })

  it('expires or aborts queued reads without releasing an active raw admission', async () => {
    let now = 100
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const oldLease = manager.registerLease(key, 'lease-old')
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
    const activeController = new AbortController()
    const activeContext = new ResidentHighWaterOperationContext(
      activeController.signal,
      () => 5_000,
      () => manager.invalidateLease(key, oldLease)
    )
    const active = manager.admit(key, record(7, 'a'), oldLease, () => true, activeContext)
    await readStarted

    const expiredController = new AbortController()
    const expiredContext = new ResidentHighWaterOperationContext(
      expiredController.signal,
      () => 2_600 - now,
      () => manager.invalidateLease(key, oldLease)
    )
    expect(expiredContext.remainingBudgetMs()).toBe(2_500)
    now = 2_100
    expect(expiredContext.remainingBudgetMs()).toBe(500)
    const expired = manager.admit(key, record(8, 'b'), oldLease, () => true, expiredContext)
    now = 2_600
    expect(expiredContext.isActive()).toBe(false)
    await expect(expired).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_admission_abandoned'
    })

    const abortedController = new AbortController()
    const abortedContext = new ResidentHighWaterOperationContext(
      abortedController.signal,
      () => 1_000,
      () => manager.invalidateLease(key, oldLease)
    )
    const aborted = manager.admit(key, record(8, 'b'), oldLease, () => true, abortedContext)
    const abortedWait = waitForResidentSourceAdmission(
      aborted,
      abortedController.signal,
      1_000,
      () => abortedContext.abandon()
    )
    abortedController.abort()
    await expect(abortedWait).resolves.toBeUndefined()
    await expect(aborted).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_admission_abandoned'
    })
    expect([...store.readCounts.values()]).toEqual([1])

    const newLease = manager.registerLease(key, 'lease-new')
    const next = manager.admit(key, record(8, 'b'), newLease)
    activeContext.abandon()
    await Promise.resolve()
    expect([...store.readCounts.values()]).toEqual([1])
    expect(store.compareCandidates).toHaveLength(0)

    releaseRead()
    await expect(active).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_admission_abandoned'
    })
    await expect(next).resolves.toMatchObject({ status: 'admitted' })
    expect(store.compareCandidates).toHaveLength(1)
    expect(store.quarantinedReasons).toHaveLength(0)
  })

  it('bounds a stalled first-adoption permission and retains its slot until settlement', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    let allowFirstAdoption = (): void => undefined
    let markPermissionStarted = (): void => undefined
    const permissionStarted = new Promise<void>((resolve) => {
      markPermissionStarted = resolve
    })
    const permissionGate = new Promise<void>((resolve) => {
      allowFirstAdoption = resolve
    })
    let blockFirstPermission = true
    const manager = new TicketWorkspaceResidentHighWater(store, {
      ...permissions(),
      authorizeFirstAdoption: async () => {
        if (blockFirstPermission) {
          blockFirstPermission = false
          markPermissionStarted()
          await permissionGate
        }
        return true
      }
    })
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    const controller = new AbortController()
    const context = new ResidentHighWaterOperationContext(
      controller.signal,
      () => 25,
      () => manager.invalidateLease(key, lease)
    )
    const active = manager.admit(key, record(7, 'a'), lease, () => true, context)
    const caller = waitForResidentSourceAdmission(active, controller.signal, 25, () =>
      context.abandon()
    )
    await permissionStarted
    await expect(caller).resolves.toBeUndefined()

    const successor = manager.admit(key, record(7, 'a'), lease)
    expect([...store.readCounts.values()]).toEqual([1])
    expect(store.compareCandidates).toHaveLength(0)
    allowFirstAdoption()
    await expect(active).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_admission_abandoned'
    })
    await expect(successor).resolves.toMatchObject({ status: 'admitted' })
    expect(store.compareCandidates).toHaveLength(1)
  })

  it.each([
    { result: 'committed', conflict: false, expectedReads: 2 },
    { result: 'conflict', conflict: true, expectedReads: 3 }
  ] as const)(
    'does not start retry or confirmation reads after a delayed $result acknowledgement is abandoned',
    async ({ conflict, expectedReads }) => {
      const acknowledgementStarted = deferredVoid()
      const acknowledgement = deferredVoid()
      const store = new DelayedCompareAcknowledgementStore(
        () => acknowledgementStarted.resolve(),
        acknowledgement.promise
      )
      if (conflict) {
        store.conflictNextCompare = 1
      }
      const manager = new TicketWorkspaceResidentHighWater(store, permissions())
      const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
      const lease = manager.registerLease(key, 'lease-a')
      const controller = new AbortController()
      const context = new ResidentHighWaterOperationContext(
        controller.signal,
        () => 5_000,
        () => manager.invalidateLease(key, lease)
      )
      const active = manager.admit(key, record(7, 'a'), lease, () => true, context)
      const caller = waitForResidentSourceAdmission(active, controller.signal, 5_000, () =>
        context.abandon()
      )
      await acknowledgementStarted.promise

      expect(store.committedCandidates).toHaveLength(conflict ? 0 : 1)
      const successor = manager.admit(key, record(7, 'a'), lease)
      let activeSettled = false
      void active.then(() => {
        activeSettled = true
      })
      controller.abort()
      await expect(caller).resolves.toBeUndefined()
      expect(activeSettled).toBe(false)
      expect([...store.readCounts.values()]).toEqual([1])

      acknowledgement.resolve()
      await expect(active).resolves.toEqual({
        status: 'unavailable',
        reason: 'high_water_admission_abandoned'
      })
      await expect(successor).resolves.toMatchObject({ status: 'admitted' })
      expect([...store.readCounts.values()]).toEqual([expectedReads])
      expect(store.quarantinedReasons).toHaveLength(0)
    }
  )

  it('retains the admission slot through required quarantine cleanup after a delayed failed CAS', async () => {
    const acknowledgementStarted = deferredVoid()
    const acknowledgement = deferredVoid()
    const quarantineStarted = deferredVoid()
    const quarantineAcknowledgement = deferredVoid()
    const store = new DelayedCompareAndQuarantineAcknowledgementStore(
      () => acknowledgementStarted.resolve(),
      acknowledgement.promise,
      () => quarantineStarted.resolve(),
      quarantineAcknowledgement.promise
    )
    store.failCompare = true
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    const controller = new AbortController()
    const context = new ResidentHighWaterOperationContext(
      controller.signal,
      () => 5_000,
      () => manager.invalidateLease(key, lease)
    )
    const active = manager.admit(key, record(7, 'a'), lease, () => true, context)
    const caller = waitForResidentSourceAdmission(active, controller.signal, 5_000, () =>
      context.abandon()
    )
    await acknowledgementStarted.promise
    const successor = manager.admit(key, record(7, 'a'), lease)
    controller.abort()
    await expect(caller).resolves.toBeUndefined()

    acknowledgement.resolve()
    await quarantineStarted.promise
    let activeSettled = false
    void active.then(() => {
      activeSettled = true
    })
    expect(activeSettled).toBe(false)
    expect(store.quarantinedReasons).toHaveLength(0)

    quarantineAcknowledgement.resolve()
    await expect(active).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_admission_abandoned'
    })
    await expect(successor).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_quarantined'
    })
    expect([...store.readCounts.values()]).toEqual([1])
    expect(store.quarantinedReasons).toEqual(['high_water_storage_failure'])
  })

  it('quarantines after a delayed third CAS conflict even when its caller abandoned', async () => {
    const acknowledgementStarted = deferredVoid()
    const acknowledgement = deferredVoid()
    const quarantineStarted = deferredVoid()
    const quarantineAcknowledgement = deferredVoid()
    const store = new DelayedCompareAndQuarantineAcknowledgementStore(
      () => acknowledgementStarted.resolve(),
      acknowledgement.promise,
      () => quarantineStarted.resolve(),
      quarantineAcknowledgement.promise,
      3
    )
    store.conflictNextCompare = 3
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    const controller = new AbortController()
    const context = new ResidentHighWaterOperationContext(
      controller.signal,
      () => 5_000,
      () => manager.invalidateLease(key, lease)
    )
    const active = manager.admit(key, record(7, 'a'), lease, () => true, context)
    const caller = waitForResidentSourceAdmission(active, controller.signal, 5_000, () =>
      context.abandon()
    )
    await acknowledgementStarted.promise
    const successor = manager.admit(key, record(7, 'a'), lease)
    let activeSettled = false
    void active.then(() => {
      activeSettled = true
    })
    controller.abort()
    await expect(caller).resolves.toBeUndefined()
    acknowledgement.resolve()
    await quarantineStarted.promise
    expect(activeSettled).toBe(false)
    expect([...store.readCounts.values()]).toEqual([3])

    quarantineAcknowledgement.resolve()
    await expect(active).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_admission_abandoned'
    })
    await expect(successor).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_quarantined'
    })
    expect([...store.readCounts.values()]).toEqual([3])
    expect(store.quarantinedReasons).toEqual(['high_water_storage_failure'])
  })

  it('bounds stalled commit readback without publishing late admission or releasing its slot', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    let readCount = 0
    let markReadbackStarted = (): void => undefined
    const readbackStarted = new Promise<void>((resolve) => {
      markReadbackStarted = resolve
    })
    let releaseReadback = (): void => undefined
    const readbackGate = new Promise<void>((resolve) => {
      releaseReadback = resolve
    })
    store.beforeRead = async () => {
      readCount += 1
      if (readCount === 2) {
        markReadbackStarted()
        await readbackGate
      }
    }
    const manager = new TicketWorkspaceResidentHighWater(store, permissions())
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    const controller = new AbortController()
    const context = new ResidentHighWaterOperationContext(
      controller.signal,
      () => 25,
      () => manager.invalidateLease(key, lease)
    )
    const active = manager.admit(key, record(7, 'a'), lease, () => true, context)
    const caller = waitForResidentSourceAdmission(active, controller.signal, 25, () =>
      context.abandon()
    )
    await readbackStarted
    await expect(caller).resolves.toBeUndefined()
    const successor = manager.admit(key, record(7, 'a'), lease)
    expect([...store.readCounts.values()]).toEqual([2])
    expect(store.committedCandidates).toHaveLength(1)

    releaseReadback()
    await expect(active).resolves.toEqual({
      status: 'unavailable',
      reason: 'high_water_admission_abandoned'
    })
    await expect(successor).resolves.toMatchObject({ status: 'admitted' })
    expect(store.quarantinedReasons).toHaveLength(0)
  })

  it('requires explicit rebind and quarantine recovery, revoking earlier facts', async () => {
    let rebindAllowed = false
    let recoveryAllowed = false
    const allow = permissions()
    const store = new MemoryResidentSourceHighWaterStore()
    const manager = new TicketWorkspaceResidentHighWater(store, {
      ...allow,
      authorizeRebind: async () => rebindAllowed,
      authorizeRecovery: async () => recoveryAllowed
    })
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const lease = manager.registerLease(key, 'lease-a')
    const first = await manager.admit(key, record(7, 'a'), lease)
    expect(first.status).toBe('admitted')
    const base = createResidentSourceBaseKey(binding)
    expect(await manager.rebind(base, 'epoch-a', 'epoch-b')).toBe('unavailable')
    rebindAllowed = true
    expect(await manager.rebind(base, 'epoch-a', 'epoch-b')).toBe('rebound')
    if (first.status === 'admitted') {
      expect(manager.isCurrent(first.facts)).toBe(false)
    }
    const nextKey = createResidentSourceHighWaterKey(binding, 'epoch-b')
    const nextLease = manager.registerLease(nextKey, 'lease-b')
    expect((await manager.admit(nextKey, record(1, 'b'), nextLease)).status).toBe('admitted')

    await manager.quarantine(nextKey, 'source_equivocation')
    expect(await manager.recoverQuarantine(nextKey, record(1, 'b'))).toBe('unavailable')
    recoveryAllowed = true
    expect(await manager.recoverQuarantine(nextKey, record(1, 'b'))).toBe('recovered')
    const recovered = await manager.admit(nextKey, record(1, 'b'), nextLease)
    expect(recovered.status).toBe('admitted')
  })
})

function permissions(firstAdoption = true): ResidentSourceHighWaterPermissions {
  return {
    authorizeFirstAdoption: async () => firstAdoption,
    authorizeRebind: async () => true,
    authorizeRecovery: async () => true
  }
}

function record(
  ledgerRevision: number,
  catalogDigestSuffix: string
): ResidentSourceHighWaterRecord {
  return {
    ledgerRevision,
    projectionSequence: 0,
    catalogDigest: catalogDigestSuffix.repeat(64).slice(0, 64)
  }
}

class DelayedCompareAcknowledgementStore extends MemoryResidentSourceHighWaterStore {
  private delayed = false
  private compareCount = 0

  constructor(
    private readonly markAcknowledgementStarted: () => void,
    private readonly acknowledgement: Promise<void>,
    private readonly delayedCompareNumber = 1
  ) {
    super()
  }

  override async compareAndAdvance(
    ...args: Parameters<MemoryResidentSourceHighWaterStore['compareAndAdvance']>
  ): ReturnType<MemoryResidentSourceHighWaterStore['compareAndAdvance']> {
    const result = await super.compareAndAdvance(...args)
    this.compareCount += 1
    if (!this.delayed && this.compareCount === this.delayedCompareNumber) {
      this.delayed = true
      this.markAcknowledgementStarted()
      await this.acknowledgement
    }
    return result
  }
}

class DelayedCompareAndQuarantineAcknowledgementStore extends DelayedCompareAcknowledgementStore {
  constructor(
    markAcknowledgementStarted: () => void,
    acknowledgement: Promise<void>,
    private readonly markQuarantineStarted: () => void,
    private readonly quarantineAcknowledgement: Promise<void>,
    delayedCompareNumber = 1
  ) {
    super(markAcknowledgementStarted, acknowledgement, delayedCompareNumber)
  }

  override async quarantine(
    ...args: Parameters<MemoryResidentSourceHighWaterStore['quarantine']>
  ): ReturnType<MemoryResidentSourceHighWaterStore['quarantine']> {
    this.markQuarantineStarted()
    await this.quarantineAcknowledgement
    return super.quarantine(...args)
  }
}

function deferredVoid(): Readonly<{ promise: Promise<void>; resolve: () => void }> {
  let resolvePromise = (): void => undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = () => resolve()
  })
  return { promise, resolve: resolvePromise }
}
