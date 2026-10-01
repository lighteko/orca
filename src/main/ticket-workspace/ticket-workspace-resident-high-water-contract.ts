import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'

export type ResidentSourceBaseKey = Readonly<{
  executionHost: Readonly<{ machineId: string; distro: string }>
  profile: Readonly<TicketResidentBinding['profile']>
  authorityId: string
}>

export type ResidentSourceHighWaterKey = Readonly<ResidentSourceBaseKey & { ledgerEpoch: string }>

export type ResidentSourceHighWaterRecord = Readonly<{
  ledgerRevision: number
  projectionSequence: number
  catalogDigest: string
}>

export type ResidentSourceHighWaterState =
  | { kind: 'ready'; generation: string; record: ResidentSourceHighWaterRecord }
  | { kind: 'quarantined'; generation: string; reason: string }
  | { kind: 'never-initialized' }
  | { kind: 'inactive-epoch' }
  | { kind: 'missing-or-corrupt' }

export type ResidentSourceHighWaterStore = Readonly<{
  read(key: ResidentSourceHighWaterKey): Promise<ResidentSourceHighWaterState>
  compareAndAdvance(
    key: ResidentSourceHighWaterKey,
    expectedGeneration: string | null,
    candidate: ResidentSourceHighWaterRecord,
    canCommit: () => boolean
  ): Promise<'committed' | 'conflict' | 'failed' | 'not-current'>
  quarantine(key: ResidentSourceHighWaterKey, reason: string): Promise<'committed' | 'failed'>
  recoverQuarantine(
    key: ResidentSourceHighWaterKey,
    anchor: ResidentSourceHighWaterRecord
  ): Promise<'recovered' | 'conflict' | 'failed'>
  rebind(
    key: ResidentSourceBaseKey,
    oldEpoch: string,
    newEpoch: string
  ): Promise<'rebound' | 'conflict' | 'failed'>
}>

export type ResidentHighWaterOperationContext = Readonly<{
  remainingBudgetMs(): number
  isAbandoned(): boolean
  isActive(): boolean
  abandon(): void
  dispose(): void
  onAbandon(callback: () => void): () => void
}>

export type ResidentSourceHighWaterPermissions = Readonly<{
  authorizeFirstAdoption(key: ResidentSourceHighWaterKey): Promise<boolean>
  authorizeRebind(key: ResidentSourceBaseKey, oldEpoch: string, newEpoch: string): Promise<boolean>
  authorizeRecovery(key: ResidentSourceHighWaterKey): Promise<boolean>
}>

export type ResidentHighWaterFacts = Readonly<{
  key: ResidentSourceHighWaterKey
  record: ResidentSourceHighWaterRecord
  revisionGeneration: number
  invalidationGeneration: number
  quarantineGeneration: number
  leaseGeneration: number
}>

export type ResidentHighWaterAdmission =
  | { status: 'admitted'; facts: ResidentHighWaterFacts }
  | {
      status: 'unavailable'
      reason:
        | 'initial_adoption_required'
        | 'source_revision_regression'
        | 'source_equivocation'
        | 'high_water_quarantined'
        | 'high_water_history_lost'
        | 'high_water_storage_failure'
        | 'high_water_admission_capacity'
        | 'high_water_admission_abandoned'
    }

export type ResidentHighWaterPartitionState = {
  key: ResidentSourceHighWaterKey
  baseKey: ResidentSourceBaseKey
  sourceRecord: ResidentSourceHighWaterRecord | undefined
  revisionGeneration: number
  invalidationGeneration: number
  quarantineGeneration: number
  leaseGeneration: number
  leaseIdentity: string | undefined
  rebindPending: boolean
  quarantined: boolean
}

export function compareSourceOrder(
  left: ResidentSourceHighWaterRecord,
  right: ResidentSourceHighWaterRecord
): -1 | 0 | 1 {
  if (left.ledgerRevision !== right.ledgerRevision) {
    return left.ledgerRevision < right.ledgerRevision ? -1 : 1
  }
  if (left.projectionSequence !== right.projectionSequence) {
    return left.projectionSequence < right.projectionSequence ? -1 : 1
  }
  return 0
}

export function createResidentSourceHighWaterKey(
  binding: TicketResidentBinding,
  ledgerEpoch: string
): ResidentSourceHighWaterKey {
  return Object.freeze({
    executionHost: Object.freeze({
      machineId: binding.executionHost.machineId,
      distro: binding.executionHost.distro
    }),
    profile: Object.freeze({ ...binding.profile }),
    authorityId: binding.authorityId,
    ledgerEpoch
  })
}

export function createResidentSourceBaseKey(binding: TicketResidentBinding): ResidentSourceBaseKey {
  return Object.freeze({
    executionHost: Object.freeze({
      machineId: binding.executionHost.machineId,
      distro: binding.executionHost.distro
    }),
    profile: Object.freeze({ ...binding.profile }),
    authorityId: binding.authorityId
  })
}

export function sameHighWaterRecord(
  left: ResidentSourceHighWaterRecord | undefined,
  right: ResidentSourceHighWaterRecord
): boolean {
  return (
    left !== undefined &&
    compareSourceOrder(left, right) === 0 &&
    left.catalogDigest === right.catalogDigest
  )
}

export function cloneHighWaterRecord(
  record: ResidentSourceHighWaterRecord
): ResidentSourceHighWaterRecord {
  return Object.freeze({ ...record })
}

export function cloneHighWaterKey(key: ResidentSourceHighWaterKey): ResidentSourceHighWaterKey {
  return Object.freeze({ ...cloneHighWaterBaseKey(key), ledgerEpoch: key.ledgerEpoch })
}

export function cloneHighWaterBaseKey(key: ResidentSourceBaseKey): ResidentSourceBaseKey {
  return Object.freeze({
    executionHost: Object.freeze({ ...key.executionHost }),
    profile: Object.freeze({ ...key.profile }),
    authorityId: key.authorityId
  })
}

export function sameHighWaterBase(
  left: ResidentSourceBaseKey,
  right: ResidentSourceBaseKey
): boolean {
  return (
    highWaterKeyId({ ...left, ledgerEpoch: '' }) === highWaterKeyId({ ...right, ledgerEpoch: '' })
  )
}

export function highWaterKeyId(key: ResidentSourceHighWaterKey): string {
  return JSON.stringify([
    key.executionHost.machineId,
    key.executionHost.distro,
    key.profile.profileId,
    key.profile.schemaVersion,
    key.profile.profileVersion,
    key.authorityId,
    key.ledgerEpoch
  ])
}

export function setHighWaterCurrentRecord(
  partition: ResidentHighWaterPartitionState,
  record: ResidentSourceHighWaterRecord
): void {
  if (!sameHighWaterRecord(partition.sourceRecord, record)) {
    partition.sourceRecord = cloneHighWaterRecord(record)
    partition.revisionGeneration += 1
    partition.invalidationGeneration += 1
  }
}

export function createHighWaterFacts(
  partition: ResidentHighWaterPartitionState,
  key: ResidentSourceHighWaterKey,
  record: ResidentSourceHighWaterRecord,
  leaseGeneration: number
): ResidentHighWaterFacts {
  return Object.freeze({
    key: cloneHighWaterKey(key),
    record: cloneHighWaterRecord(record),
    revisionGeneration: partition.revisionGeneration,
    invalidationGeneration: partition.invalidationGeneration,
    quarantineGeneration: partition.quarantineGeneration,
    leaseGeneration
  })
}

export function markHighWaterQuarantined(partition: ResidentHighWaterPartitionState): void {
  if (!partition.quarantined) {
    partition.quarantined = true
    partition.quarantineGeneration += 1
    partition.invalidationGeneration += 1
  }
}
