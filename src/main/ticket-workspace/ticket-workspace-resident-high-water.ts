import {
  cloneHighWaterBaseKey,
  cloneHighWaterKey,
  cloneHighWaterRecord,
  highWaterKeyId,
  sameHighWaterBase,
  sameHighWaterRecord,
  type ResidentHighWaterPartitionState,
  type ResidentSourceBaseKey,
  type ResidentSourceHighWaterKey,
  type ResidentSourceHighWaterRecord,
  type ResidentSourceHighWaterStore,
  type ResidentSourceHighWaterPermissions,
  type ResidentHighWaterFacts,
  type ResidentHighWaterAdmission
} from './ticket-workspace-resident-high-water-contract'
import { ResidentSourceHighWaterAdmissionEngine } from './ticket-workspace-resident-high-water-admission'

export {
  compareSourceOrder,
  createResidentSourceBaseKey,
  createResidentSourceHighWaterKey
} from './ticket-workspace-resident-high-water-contract'
export type {
  ResidentHighWaterAdmission,
  ResidentHighWaterFacts,
  ResidentSourceBaseKey,
  ResidentSourceHighWaterKey,
  ResidentSourceHighWaterPermissions,
  ResidentSourceHighWaterRecord,
  ResidentSourceHighWaterState,
  ResidentSourceHighWaterStore
} from './ticket-workspace-resident-high-water-contract'

export class TicketWorkspaceResidentHighWater {
  private readonly partitions = new Map<string, ResidentHighWaterPartitionState>()
  private readonly queues = new Map<string, Promise<void>>()
  private readonly pendingRebinds = new Set<string>()
  private readonly admission: ResidentSourceHighWaterAdmissionEngine

  constructor(
    private readonly store: ResidentSourceHighWaterStore,
    private readonly permissions: ResidentSourceHighWaterPermissions
  ) {
    this.admission = new ResidentSourceHighWaterAdmissionEngine(store, permissions)
  }

  registerLease(key: ResidentSourceHighWaterKey, leaseIdentity: string): number {
    const partition = this.partition(key)
    if (partition.leaseIdentity !== leaseIdentity) {
      partition.leaseIdentity = leaseIdentity
      partition.leaseGeneration += 1
      partition.invalidationGeneration += 1
    }
    return partition.leaseGeneration
  }

  invalidateLease(key: ResidentSourceHighWaterKey, leaseGeneration: number): void {
    const partition = this.partition(key)
    if (partition.leaseGeneration === leaseGeneration) {
      partition.invalidationGeneration += 1
    }
  }

  retireLease(key: ResidentSourceHighWaterKey, leaseGeneration: number): void {
    const partition = this.partition(key)
    if (partition.leaseGeneration === leaseGeneration) {
      partition.leaseIdentity = undefined
      partition.leaseGeneration += 1
      partition.invalidationGeneration += 1
    }
  }

  async admit(
    key: ResidentSourceHighWaterKey,
    candidate: ResidentSourceHighWaterRecord,
    leaseGeneration: number,
    canContinue: () => boolean = () => true
  ): Promise<ResidentHighWaterAdmission> {
    return await this.runExclusive(
      key,
      async () =>
        await this.admission.admit(
          key,
          candidate,
          this.partition(key),
          leaseGeneration,
          canContinue
        )
    )
  }

  async rebind(
    key: ResidentSourceBaseKey,
    oldEpoch: string,
    newEpoch: string
  ): Promise<'rebound' | 'unavailable'> {
    let authorized = false
    try {
      authorized = await this.permissions.authorizeRebind(key, oldEpoch, newEpoch)
    } catch {
      return 'unavailable'
    }
    if (oldEpoch === newEpoch || !authorized) {
      return 'unavailable'
    }
    const pendingKey = rebindId(key, oldEpoch)
    if (this.pendingRebinds.has(pendingKey)) {
      return 'unavailable'
    }
    this.pendingRebinds.add(pendingKey)
    for (const partition of this.partitions.values()) {
      if (sameHighWaterBase(partition.baseKey, key) && partition.key.ledgerEpoch === oldEpoch) {
        this.retireForRebind(partition)
      }
    }
    try {
      if ((await this.store.rebind(key, oldEpoch, newEpoch)) !== 'rebound') {
        this.finishRebind(key, oldEpoch)
        return 'unavailable'
      }
    } catch {
      this.finishRebind(key, oldEpoch)
      return 'unavailable'
    }
    this.finishRebind(key, oldEpoch)
    return 'rebound'
  }

  async recoverQuarantine(
    key: ResidentSourceHighWaterKey,
    anchor: ResidentSourceHighWaterRecord
  ): Promise<'recovered' | 'unavailable'> {
    let authorized = false
    try {
      authorized = await this.permissions.authorizeRecovery(key)
    } catch {
      return 'unavailable'
    }
    if (!authorized) {
      return 'unavailable'
    }
    try {
      if ((await this.store.recoverQuarantine(key, anchor)) !== 'recovered') {
        return 'unavailable'
      }
    } catch {
      return 'unavailable'
    }
    const partition = this.partition(key)
    partition.quarantined = false
    partition.quarantineGeneration += 1
    partition.invalidationGeneration += 1
    partition.sourceRecord = cloneHighWaterRecord(anchor)
    partition.revisionGeneration += 1
    return 'recovered'
  }

  isCurrent(facts: ResidentHighWaterFacts): boolean {
    const partition = this.partition(facts.key)
    return (
      !partition.quarantined &&
      !partition.rebindPending &&
      partition.leaseGeneration === facts.leaseGeneration &&
      partition.revisionGeneration === facts.revisionGeneration &&
      partition.invalidationGeneration === facts.invalidationGeneration &&
      partition.quarantineGeneration === facts.quarantineGeneration &&
      sameHighWaterRecord(partition.sourceRecord, facts.record)
    )
  }

  async quarantine(key: ResidentSourceHighWaterKey, reason: string): Promise<void> {
    await this.admission.quarantine(this.partition(key), reason)
  }

  private partition(key: ResidentSourceHighWaterKey): ResidentHighWaterPartitionState {
    const id = highWaterKeyId(key)
    let partition = this.partitions.get(id)
    if (!partition) {
      partition = {
        key: cloneHighWaterKey(key),
        baseKey: cloneHighWaterBaseKey(key),
        sourceRecord: undefined,
        revisionGeneration: 0,
        invalidationGeneration: 0,
        quarantineGeneration: 0,
        leaseGeneration: 0,
        leaseIdentity: undefined,
        rebindPending: this.pendingRebinds.has(rebindId(key, key.ledgerEpoch)),
        quarantined: false
      }
      this.partitions.set(id, partition)
    }
    return partition
  }

  private retireForRebind(partition: ResidentHighWaterPartitionState): void {
    partition.rebindPending = true
    partition.invalidationGeneration += 1
    partition.leaseGeneration += 1
    partition.leaseIdentity = undefined
  }

  private finishRebind(key: ResidentSourceBaseKey, oldEpoch: string): void {
    this.pendingRebinds.delete(rebindId(key, oldEpoch))
    for (const partition of this.partitions.values()) {
      if (sameHighWaterBase(partition.baseKey, key) && partition.key.ledgerEpoch === oldEpoch) {
        partition.rebindPending = false
        partition.invalidationGeneration += 1
      }
    }
  }

  private async runExclusive<T>(
    key: ResidentSourceHighWaterKey,
    operation: () => Promise<T>
  ): Promise<T> {
    const id = highWaterKeyId(key)
    const previous = this.queues.get(id) ?? Promise.resolve()
    const safePrevious = previous.catch(() => undefined)
    let release = (): void => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = safePrevious.then(() => held)
    this.queues.set(id, tail)
    await safePrevious
    try {
      return await operation()
    } finally {
      release()
      if (this.queues.get(id) === tail) {
        this.queues.delete(id)
      }
    }
  }
}

function rebindId(key: ResidentSourceBaseKey, ledgerEpoch: string): string {
  return JSON.stringify([
    key.executionHost.machineId,
    key.executionHost.distro,
    key.profile.profileId,
    key.profile.schemaVersion,
    key.profile.profileVersion,
    key.authorityId,
    ledgerEpoch
  ])
}
