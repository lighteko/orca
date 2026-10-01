import {
  compareSourceOrder,
  createHighWaterFacts,
  markHighWaterQuarantined,
  sameHighWaterRecord,
  setHighWaterCurrentRecord,
  type ResidentHighWaterAdmission,
  type ResidentHighWaterPartitionState,
  type ResidentSourceHighWaterKey,
  type ResidentSourceHighWaterPermissions,
  type ResidentSourceHighWaterRecord,
  type ResidentSourceHighWaterStore,
  type ResidentSourceHighWaterState
} from './ticket-workspace-resident-high-water-contract'

const MAX_CAS_ATTEMPTS = 3

export class ResidentSourceHighWaterAdmissionEngine {
  constructor(
    private readonly store: ResidentSourceHighWaterStore,
    private readonly permissions: ResidentSourceHighWaterPermissions
  ) {}

  async admit(
    key: ResidentSourceHighWaterKey,
    candidate: ResidentSourceHighWaterRecord,
    partition: ResidentHighWaterPartitionState,
    leaseGeneration: number,
    canContinue: () => boolean
  ): Promise<ResidentHighWaterAdmission> {
    const expectedInvalidation = partition.invalidationGeneration
    const expectedQuarantine = partition.quarantineGeneration
    const isAdmissionCurrent = (): boolean =>
      this.canContinue(
        partition,
        leaseGeneration,
        expectedInvalidation,
        expectedQuarantine,
        canContinue
      )
    if (!isAdmissionCurrent()) {
      return unavailable('high_water_quarantined')
    }

    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const state = await this.readState(key, partition)
      if (!state) {
        return unavailable('high_water_storage_failure')
      }
      if (!isAdmissionCurrent()) {
        return unavailable('high_water_quarantined')
      }
      if (state.kind === 'quarantined') {
        markHighWaterQuarantined(partition)
        return unavailable('high_water_quarantined')
      }
      if (state.kind === 'inactive-epoch') {
        return unavailable('high_water_quarantined')
      }
      if (state.kind === 'missing-or-corrupt') {
        await this.failClosed(partition, 'high_water_history_lost')
        return unavailable('high_water_history_lost')
      }
      if (state.kind === 'never-initialized') {
        const firstAdoption = await this.authorizeFirstAdoption(key)
        if (!firstAdoption) {
          return unavailable('initial_adoption_required')
        }
        if (!isAdmissionCurrent()) {
          return unavailable('high_water_quarantined')
        }
        const result = await this.compareAndAdvance(
          key,
          null,
          candidate,
          partition,
          isAdmissionCurrent
        )
        if (result === 'conflict') {
          continue
        }
        if (result === 'failed') {
          await this.failClosed(partition, 'high_water_storage_failure')
          return unavailable('high_water_storage_failure')
        }
        if (result !== 'committed') {
          return unavailable('high_water_quarantined')
        }
        return await this.confirmCommit(
          partition,
          key,
          candidate,
          leaseGeneration,
          isAdmissionCurrent
        )
      }

      const order = compareSourceOrder(candidate, state.record)
      if (order < 0) {
        await this.failClosed(partition, 'source_revision_regression')
        return unavailable('source_revision_regression')
      }
      if (order === 0) {
        if (candidate.catalogDigest !== state.record.catalogDigest) {
          await this.failClosed(partition, 'source_equivocation')
          return unavailable('source_equivocation')
        }
        if (!isAdmissionCurrent()) {
          return unavailable('high_water_quarantined')
        }
        setHighWaterCurrentRecord(partition, state.record)
        return admitted(partition, key, state.record, leaseGeneration)
      }

      const result = await this.compareAndAdvance(
        key,
        state.generation,
        candidate,
        partition,
        isAdmissionCurrent
      )
      if (result === 'conflict') {
        continue
      }
      if (result === 'failed') {
        await this.failClosed(partition, 'high_water_storage_failure')
        return unavailable('high_water_storage_failure')
      }
      if (result !== 'committed') {
        return unavailable('high_water_quarantined')
      }
      return await this.confirmCommit(
        partition,
        key,
        candidate,
        leaseGeneration,
        isAdmissionCurrent
      )
    }

    await this.failClosed(partition, 'high_water_storage_failure')
    return unavailable('high_water_storage_failure')
  }

  async quarantine(partition: ResidentHighWaterPartitionState, reason: string): Promise<void> {
    markHighWaterQuarantined(partition)
    try {
      await this.store.quarantine(partition.key, reason)
    } catch {
      // Local quarantine remains authoritative for this process.
    }
  }

  private async readState(
    key: ResidentSourceHighWaterKey,
    partition: ResidentHighWaterPartitionState
  ): Promise<ResidentSourceHighWaterState | undefined> {
    try {
      return await this.store.read(key)
    } catch {
      await this.failClosed(partition, 'high_water_storage_failure')
      return undefined
    }
  }

  private async authorizeFirstAdoption(key: ResidentSourceHighWaterKey): Promise<boolean> {
    try {
      return await this.permissions.authorizeFirstAdoption(key)
    } catch {
      return false
    }
  }

  private async compareAndAdvance(
    key: ResidentSourceHighWaterKey,
    generation: string | null,
    candidate: ResidentSourceHighWaterRecord,
    partition: ResidentHighWaterPartitionState,
    isAdmissionCurrent: () => boolean
  ): Promise<'committed' | 'conflict' | 'failed' | 'not-current'> {
    try {
      return await this.store.compareAndAdvance(key, generation, candidate, isAdmissionCurrent)
    } catch {
      await this.failClosed(partition, 'high_water_storage_failure')
      return 'failed'
    }
  }

  private async confirmCommit(
    partition: ResidentHighWaterPartitionState,
    key: ResidentSourceHighWaterKey,
    candidate: ResidentSourceHighWaterRecord,
    leaseGeneration: number,
    isAdmissionCurrent: () => boolean
  ): Promise<ResidentHighWaterAdmission> {
    const state = await this.readState(key, partition)
    if (!state) {
      return unavailable('high_water_storage_failure')
    }
    if (!isAdmissionCurrent()) {
      return unavailable('high_water_quarantined')
    }
    if (state.kind === 'inactive-epoch') {
      return unavailable('high_water_quarantined')
    }
    if (state.kind !== 'ready' || !sameHighWaterRecord(state.record, candidate)) {
      await this.failClosed(
        partition,
        state.kind === 'ready' ? 'source_revision_regression' : 'high_water_history_lost'
      )
      return unavailable(
        state.kind === 'ready' ? 'source_revision_regression' : 'high_water_history_lost'
      )
    }
    setHighWaterCurrentRecord(partition, state.record)
    return admitted(partition, key, state.record, leaseGeneration)
  }

  private canContinue(
    partition: ResidentHighWaterPartitionState,
    leaseGeneration: number,
    invalidationGeneration: number,
    quarantineGeneration: number,
    canContinue: () => boolean
  ): boolean {
    if (
      partition.quarantined ||
      partition.rebindPending ||
      partition.leaseGeneration !== leaseGeneration ||
      partition.invalidationGeneration !== invalidationGeneration ||
      partition.quarantineGeneration !== quarantineGeneration
    ) {
      return false
    }
    try {
      return canContinue()
    } catch {
      return false
    }
  }

  private async failClosed(
    partition: ResidentHighWaterPartitionState,
    reason: string
  ): Promise<void> {
    await this.quarantine(partition, reason)
  }
}

function admitted(
  partition: ResidentHighWaterPartitionState,
  key: ResidentSourceHighWaterKey,
  record: ResidentSourceHighWaterRecord,
  leaseGeneration: number
): ResidentHighWaterAdmission {
  return {
    status: 'admitted',
    facts: createHighWaterFacts(partition, key, record, leaseGeneration)
  }
}

function unavailable(
  reason: Extract<ResidentHighWaterAdmission, { status: 'unavailable' }>['reason']
): ResidentHighWaterAdmission {
  return { status: 'unavailable', reason }
}
