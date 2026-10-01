import { describe, expect, it } from 'vitest'
import { binding } from './ticket-workspace-resident-test-peer'
import {
  createResidentSourceBaseKey,
  createResidentSourceHighWaterKey,
  TicketWorkspaceResidentHighWater
} from './ticket-workspace-resident-high-water'
import { MemoryResidentSourceHighWaterStore } from './ticket-workspace-resident-high-water-test-store'

describe('resident high-water lease currentness', () => {
  it('observes only an existing active lease without touching durable storage', () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const highWater = new TicketWorkspaceResidentHighWater(store, permissions)
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')

    expect(highWater.captureLeaseInvalidationGeneration(key, 0)).toBeNull()
    expect(highWater.isLeaseCurrent(key, 0, 0)).toBe(false)

    const leaseGeneration = highWater.registerLease(key, 'lease-a')
    const invalidationGeneration = highWater.captureLeaseInvalidationGeneration(
      key,
      leaseGeneration
    )
    expect(invalidationGeneration).not.toBeNull()
    if (invalidationGeneration === null) {
      return
    }
    expect(highWater.isLeaseCurrent(key, leaseGeneration, invalidationGeneration)).toBe(true)
    expect(store.readCounts.size).toBe(0)
    expect(store.compareCandidates).toHaveLength(0)
  })

  it('rejects prior stamps after invalidation, replacement, and retirement', () => {
    const highWater = new TicketWorkspaceResidentHighWater(
      new MemoryResidentSourceHighWaterStore(),
      permissions
    )
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const firstLease = highWater.registerLease(key, 'lease-a')
    const firstStamp = highWater.captureLeaseInvalidationGeneration(key, firstLease)

    expect(firstStamp).not.toBeNull()
    if (firstStamp === null) {
      return
    }
    highWater.invalidateLease(key, firstLease)
    expect(highWater.isLeaseCurrent(key, firstLease, firstStamp)).toBe(false)

    const secondStamp = highWater.captureLeaseInvalidationGeneration(key, firstLease)
    expect(secondStamp).not.toBeNull()
    if (secondStamp === null) {
      return
    }
    expect(highWater.isLeaseCurrent(key, firstLease, secondStamp)).toBe(true)

    const replacementLease = highWater.registerLease(key, 'lease-b')
    expect(replacementLease).not.toBe(firstLease)
    expect(highWater.isLeaseCurrent(key, firstLease, secondStamp)).toBe(false)
    expect(highWater.captureLeaseInvalidationGeneration(key, replacementLease)).not.toBeNull()

    highWater.retireLease(key, replacementLease)
    expect(highWater.captureLeaseInvalidationGeneration(key, replacementLease)).toBeNull()
  })

  it('rejects pending rebind and quarantine without admitting a lease', async () => {
    const store = new MemoryResidentSourceHighWaterStore()
    const highWater = new TicketWorkspaceResidentHighWater(store, permissions)
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    store.seed(key, { ledgerRevision: 1, projectionSequence: 0, catalogDigest: 'a'.repeat(64) })
    const leaseGeneration = highWater.registerLease(key, 'lease-a')
    let markRebindStarted = (): void => undefined
    const rebindStarted = new Promise<void>((resolve) => {
      markRebindStarted = resolve
    })
    let finishRebind = (): void => undefined
    const rebindGate = new Promise<void>((resolve) => {
      finishRebind = resolve
    })
    store.beforeRebind = async () => {
      markRebindStarted()
      await rebindGate
    }

    const rebind = highWater.rebind(createResidentSourceBaseKey(binding), 'epoch-a', 'epoch-b')
    await rebindStarted
    expect(highWater.captureLeaseInvalidationGeneration(key, leaseGeneration)).toBeNull()
    expect(highWater.isLeaseCurrent(key, leaseGeneration, 0)).toBe(false)
    finishRebind()
    await expect(rebind).resolves.toBe('rebound')

    const nextKey = createResidentSourceHighWaterKey(binding, 'epoch-b')
    const nextLease = highWater.registerLease(nextKey, 'lease-b')
    await highWater.quarantine(nextKey, 'source_equivocation')
    expect(highWater.captureLeaseInvalidationGeneration(nextKey, nextLease)).toBeNull()
  })
})

const permissions = {
  authorizeFirstAdoption: async () => true,
  authorizeRebind: async () => true,
  authorizeRecovery: async () => true
}
