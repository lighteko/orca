import type {
  ResidentHighWaterAdmission,
  ResidentHighWaterOperationContext
} from './ticket-workspace-resident-high-water-contract'

const MAX_PENDING_ADMISSIONS_PER_KEY = 8

type AdmissionQueueEntry = {
  operation: () => Promise<ResidentHighWaterAdmission>
  context: ResidentHighWaterOperationContext | undefined
  resolve: (result: ResidentHighWaterAdmission) => void
  reject: (error: unknown) => void
  removeAbandonListener: () => void
}

type AdmissionQueue = {
  active: AdmissionQueueEntry | undefined
  pending: AdmissionQueueEntry[]
}

export class ResidentSourceHighWaterAdmissionQueue {
  private readonly queues = new Map<string, AdmissionQueue>()

  enqueue(
    keyId: string,
    context: ResidentHighWaterOperationContext | undefined,
    operation: () => Promise<ResidentHighWaterAdmission>
  ): Promise<ResidentHighWaterAdmission> {
    if (context && !context.isActive()) {
      return Promise.resolve(queueUnavailable('high_water_admission_abandoned'))
    }
    let queue = this.queues.get(keyId)
    if (queue && queue.pending.length + (queue.active ? 1 : 0) >= MAX_PENDING_ADMISSIONS_PER_KEY) {
      return Promise.resolve(queueUnavailable('high_water_admission_capacity'))
    }
    if (!queue) {
      queue = { active: undefined, pending: [] }
      this.queues.set(keyId, queue)
    }
    return new Promise((resolve, reject) => {
      const entry: AdmissionQueueEntry = {
        operation,
        context,
        resolve,
        reject,
        removeAbandonListener: () => undefined
      }
      queue.pending.push(entry)
      if (context) {
        entry.removeAbandonListener = context.onAbandon(() =>
          this.cancelQueued(keyId, queue, entry)
        )
      }
      this.startNext(keyId, queue)
    })
  }

  private cancelQueued(keyId: string, queue: AdmissionQueue, entry: AdmissionQueueEntry): void {
    const index = queue.pending.indexOf(entry)
    if (index === -1) {
      return
    }
    queue.pending.splice(index, 1)
    entry.removeAbandonListener()
    entry.resolve(queueUnavailable('high_water_admission_abandoned'))
    this.startNext(keyId, queue)
  }

  private startNext(keyId: string, queue: AdmissionQueue): void {
    if (queue.active) {
      return
    }
    const entry = queue.pending.shift()
    if (!entry) {
      if (this.queues.get(keyId) === queue) {
        this.queues.delete(keyId)
      }
      return
    }
    entry.removeAbandonListener()
    if (entry.context && !entry.context.isActive()) {
      entry.resolve(queueUnavailable('high_water_admission_abandoned'))
      this.startNext(keyId, queue)
      return
    }
    queue.active = entry
    void Promise.resolve()
      .then(entry.operation)
      .then(
        (result) => this.finish(keyId, queue, entry, result),
        (error: unknown) => this.fail(keyId, queue, entry, error)
      )
  }

  private finish(
    keyId: string,
    queue: AdmissionQueue,
    entry: AdmissionQueueEntry,
    result: ResidentHighWaterAdmission
  ): void {
    queue.active = undefined
    entry.resolve(
      entry.context && !entry.context.isActive()
        ? queueUnavailable('high_water_admission_abandoned')
        : result
    )
    this.startNext(keyId, queue)
  }

  private fail(
    keyId: string,
    queue: AdmissionQueue,
    entry: AdmissionQueueEntry,
    error: unknown
  ): void {
    queue.active = undefined
    entry.reject(error)
    this.startNext(keyId, queue)
  }
}

function queueUnavailable(
  reason: 'high_water_admission_capacity' | 'high_water_admission_abandoned'
): ResidentHighWaterAdmission {
  return { status: 'unavailable', reason }
}
