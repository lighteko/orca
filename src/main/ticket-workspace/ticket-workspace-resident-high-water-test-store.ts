import type {
  ResidentSourceBaseKey,
  ResidentSourceHighWaterKey,
  ResidentSourceHighWaterRecord,
  ResidentSourceHighWaterState,
  ResidentSourceHighWaterStore
} from './ticket-workspace-resident-high-water'

export class MemoryResidentSourceHighWaterStore implements ResidentSourceHighWaterStore {
  readonly readCounts = new Map<string, number>()
  readonly compareCandidates: ResidentSourceHighWaterRecord[] = []
  readonly committedCandidates: ResidentSourceHighWaterRecord[] = []
  readonly quarantinedReasons: string[] = []
  failReads = false
  failCompare = false
  throwCompare = false
  failQuarantine = false
  conflictNextCompare = 0
  beforeRead: (() => Promise<void>) | undefined
  beforeCompare: (() => Promise<void>) | undefined
  afterCompare: (() => void) | undefined
  beforeRebind: (() => Promise<void>) | undefined

  private readonly states = new Map<string, ResidentSourceHighWaterState>()
  private readonly activeEpochs = new Map<string, string>()
  private generation = 0

  async read(key: ResidentSourceHighWaterKey): Promise<ResidentSourceHighWaterState> {
    const id = sourceKeyId(key)
    this.readCounts.set(id, (this.readCounts.get(id) ?? 0) + 1)
    await this.beforeRead?.()
    if (this.failReads) {
      throw new Error('Injected store read failure')
    }
    const activeEpoch = this.activeEpochs.get(baseKeyId(key))
    if (activeEpoch !== undefined && activeEpoch !== key.ledgerEpoch) {
      return { kind: 'inactive-epoch' }
    }
    const state = this.states.get(id)
    if (state) {
      return cloneState(state)
    }
    return activeEpoch === undefined || activeEpoch === key.ledgerEpoch
      ? { kind: 'never-initialized' }
      : { kind: 'missing-or-corrupt' }
  }

  async compareAndAdvance(
    key: ResidentSourceHighWaterKey,
    expectedGeneration: string | null,
    candidate: ResidentSourceHighWaterRecord,
    canCommit: () => boolean
  ): Promise<'committed' | 'conflict' | 'failed' | 'not-current'> {
    this.compareCandidates.push(Object.freeze({ ...candidate }))
    await this.beforeCompare?.()
    const commitAllowed = canCommit()
    this.afterCompare?.()
    if (!commitAllowed) {
      return 'not-current'
    }
    if (this.throwCompare) {
      throw new Error('Injected CAS rejection')
    }
    if (this.failCompare) {
      return 'failed'
    }
    if (this.conflictNextCompare > 0) {
      this.conflictNextCompare -= 1
      return 'conflict'
    }
    const id = sourceKeyId(key)
    const current = this.states.get(id)
    if (expectedGeneration === null && current !== undefined) {
      return 'conflict'
    }
    const activeEpoch = this.activeEpochs.get(baseKeyId(key))
    if (activeEpoch !== undefined && activeEpoch !== key.ledgerEpoch) {
      return 'conflict'
    }
    const actualGeneration = current?.kind === 'ready' ? current.generation : null
    if (actualGeneration !== expectedGeneration) {
      return 'conflict'
    }
    const nextGeneration = `g${++this.generation}`
    this.states.set(id, {
      kind: 'ready',
      generation: nextGeneration,
      record: Object.freeze({ ...candidate })
    })
    this.committedCandidates.push(Object.freeze({ ...candidate }))
    this.activeEpochs.set(baseKeyId(key), key.ledgerEpoch)
    return 'committed'
  }

  async quarantine(
    key: ResidentSourceHighWaterKey,
    reason: string
  ): Promise<'committed' | 'failed'> {
    this.quarantinedReasons.push(reason)
    if (this.failQuarantine) {
      return 'failed'
    }
    const id = sourceKeyId(key)
    const current = this.states.get(id)
    this.states.set(id, {
      kind: 'quarantined',
      generation: current?.kind === 'ready' ? current.generation : `g${++this.generation}`,
      reason
    })
    return 'committed'
  }

  async recoverQuarantine(
    key: ResidentSourceHighWaterKey,
    anchor: ResidentSourceHighWaterRecord
  ): Promise<'recovered' | 'conflict' | 'failed'> {
    if (this.failCompare) {
      return 'failed'
    }
    if (this.states.get(sourceKeyId(key))?.kind !== 'quarantined') {
      return 'conflict'
    }
    this.states.set(sourceKeyId(key), {
      kind: 'ready',
      generation: `g${++this.generation}`,
      record: Object.freeze({ ...anchor })
    })
    this.activeEpochs.set(baseKeyId(key), key.ledgerEpoch)
    return 'recovered'
  }

  async rebind(
    key: ResidentSourceBaseKey,
    oldEpoch: string,
    newEpoch: string
  ): Promise<'rebound' | 'conflict' | 'failed'> {
    await this.beforeRebind?.()
    const id = baseKeyId(key)
    const activeEpoch = this.activeEpochs.get(id)
    if (activeEpoch !== oldEpoch) {
      return 'conflict'
    }
    this.activeEpochs.set(id, newEpoch)
    return 'rebound'
  }

  markMissingOrCorrupt(key: ResidentSourceHighWaterKey): void {
    this.states.set(sourceKeyId(key), { kind: 'missing-or-corrupt' })
  }

  seed(key: ResidentSourceHighWaterKey, record: ResidentSourceHighWaterRecord): void {
    this.states.set(sourceKeyId(key), {
      kind: 'ready',
      generation: `g${++this.generation}`,
      record: Object.freeze({ ...record })
    })
    this.activeEpochs.set(baseKeyId(key), key.ledgerEpoch)
  }
}

export function sourceKeyId(key: ResidentSourceHighWaterKey): string {
  return JSON.stringify([...baseParts(key), key.ledgerEpoch])
}

function baseKeyId(key: ResidentSourceBaseKey): string {
  return JSON.stringify(baseParts(key))
}

function baseParts(key: ResidentSourceBaseKey): unknown[] {
  return [
    key.executionHost.machineId,
    key.executionHost.distro,
    key.profile.profileId,
    key.profile.schemaVersion,
    key.profile.profileVersion,
    key.authorityId
  ]
}

function cloneState(state: ResidentSourceHighWaterState): ResidentSourceHighWaterState {
  return state.kind === 'ready'
    ? { kind: 'ready', generation: state.generation, record: { ...state.record } }
    : { ...state }
}
