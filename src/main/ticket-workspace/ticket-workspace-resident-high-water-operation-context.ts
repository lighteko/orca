import type { ResidentHighWaterOperationContext as ResidentHighWaterOperationContextContract } from './ticket-workspace-resident-high-water-contract'

export class ResidentHighWaterOperationContext implements ResidentHighWaterOperationContextContract {
  private abandoned = false
  private disposed = false
  private readonly abandonCallbacks = new Set<() => void>()
  private readonly onSignalAbort = (): void => this.abandon()

  constructor(
    private readonly signal: AbortSignal,
    private readonly remaining: () => number,
    private readonly onAbandoned: () => void
  ) {
    signal.addEventListener('abort', this.onSignalAbort, { once: true })
    if (signal.aborted) {
      this.abandon()
    }
  }

  remainingBudgetMs(): number {
    const remaining = this.remaining()
    return Number.isSafeInteger(remaining) ? Math.max(0, remaining) : 0
  }

  isAbandoned(): boolean {
    return this.abandoned
  }

  isActive(): boolean {
    if (this.abandoned || this.disposed) {
      return false
    }
    const remainingBudgetMs = this.remainingBudgetMs()
    if (this.signal.aborted || remainingBudgetMs < 1) {
      this.abandon()
      return false
    }
    return true
  }

  abandon(): void {
    if (!this.abandoned && !this.disposed) {
      this.abandoned = true
      this.signal.removeEventListener('abort', this.onSignalAbort)
      this.onAbandoned()
      const callbacks = [...this.abandonCallbacks]
      this.abandonCallbacks.clear()
      for (const callback of callbacks) {
        callback()
      }
    }
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true
      this.signal.removeEventListener('abort', this.onSignalAbort)
      this.abandonCallbacks.clear()
    }
  }

  onAbandon(callback: () => void): () => void {
    if (!this.isActive()) {
      callback()
      return () => undefined
    }
    this.abandonCallbacks.add(callback)
    return () => {
      this.abandonCallbacks.delete(callback)
    }
  }
}
