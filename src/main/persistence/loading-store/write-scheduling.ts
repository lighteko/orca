import type { StoreRuntimeState } from './store-runtime-state'
import type { PrimaryStateWriteOperations } from './primary-state-writes'
import { enqueueWrite } from './primary-state-writes'

const SAVE_DEBOUNCE_MS = 1_000
const SAVE_MAX_WAIT_MS = 5_000

type WriteSchedulingOperationsRuntime = Pick<
  StoreRuntimeState,
  | 'activeViewPreference'
  | 'automationListProjectionCache'
  | 'firstPendingSaveAt'
  | 'pendingWrite'
  | 'quitFlushStarted'
  | 'writeGeneration'
  | 'worktreeCatalogBindingRevision'
  | 'writeTimer'
>

const writeSchedulingOperationsContext = Symbol('WriteSchedulingOperations')
type WriteSchedulingOperationsContext = {
  runtime: WriteSchedulingOperationsRuntime
  writes: PrimaryStateWriteOperations
}

export class WriteSchedulingOperations {
  readonly [writeSchedulingOperationsContext]: WriteSchedulingOperationsContext

  constructor(runtime: WriteSchedulingOperationsRuntime, writes: PrimaryStateWriteOperations) {
    this[writeSchedulingOperationsContext] = { runtime, writes }
  }

  async waitForPendingWrite(): Promise<void> {
    await Promise.all([
      this[writeSchedulingOperationsContext].runtime.pendingWrite,
      this[writeSchedulingOperationsContext].runtime.activeViewPreference.waitForPendingWrite()
    ])
  }
}

export function scheduleSave(owner: WriteSchedulingOperations): void {
  const runtime = owner[writeSchedulingOperationsContext].runtime
  runtime.automationListProjectionCache = null
  // Why: over-invalidation is safe; a binding token must never outlive a persisted route/identity write.
  runtime.worktreeCatalogBindingRevision += 1
  // Why: once the quit flush has snapshotted, a newly debounced write would fire during
  // teardown with nothing awaiting it, and the process can exit mid-rename. The quit
  // flush is the last write by construction.
  if (runtime.quitFlushStarted) {
    return
  }
  runtime.writeGeneration += 1
  const now = Date.now()
  runtime.firstPendingSaveAt ??= now
  if (runtime.writeTimer) {
    clearTimeout(runtime.writeTimer)
  }
  const untilMaxWait = Math.max(0, runtime.firstPendingSaveAt + SAVE_MAX_WAIT_MS - now)
  const delay = Math.min(SAVE_DEBOUNCE_MS, untilMaxWait)
  runtime.writeTimer = setTimeout(() => {
    runtime.writeTimer = null
    runtime.firstPendingSaveAt = null
    void enqueueWrite(owner[writeSchedulingOperationsContext].writes)
  }, delay)
}

export function installWriteSchedulingOperationsContext(
  target: object,
  source: WriteSchedulingOperations
): void {
  Object.defineProperty(target, writeSchedulingOperationsContext, {
    value: source[writeSchedulingOperationsContext]
  })
}
