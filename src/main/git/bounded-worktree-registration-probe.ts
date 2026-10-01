import { performance } from 'node:perf_hooks'

export const DEFAULT_WORKTREE_REGISTRATION_PROBE_TIMEOUT_MS = 5_000

const TIMED_OUT = Symbol('timed-out')
const ABORTED = Symbol('aborted')

export function createBoundedWorktreeRegistrationIdentityReader<T>(
  readIdentity: (repoPath: string, worktreePath: string) => Promise<T | null>,
  timeoutMs = DEFAULT_WORKTREE_REGISTRATION_PROBE_TIMEOUT_MS
): (repoPath: string, worktreePath: string, signal?: AbortSignal) => Promise<T | null> {
  let probeInFlight = false

  return async (repoPath, worktreePath, signal) => {
    if (probeInFlight || signal?.aborted) {
      return null
    }
    probeInFlight = true
    const deadlineAt = performance.now() + timeoutMs

    const operation = Promise.resolve()
      .then(() => readIdentity(repoPath, worktreePath))
      .catch(() => null)
    const releaseProbe = (): void => {
      probeInFlight = false
    }
    void operation.then(releaseProbe)

    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
      timer.unref?.()
    })
    const aborted = new Promise<typeof ABORTED>((resolve) => {
      if (!signal) {
        return
      }
      onAbort = () => resolve(ABORTED)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        resolve(ABORTED)
      }
    })

    const result = await Promise.race([operation, deadline, aborted])
    if (timer) {
      clearTimeout(timer)
    }
    if (onAbort && signal) {
      signal.removeEventListener('abort', onAbort)
    }
    return result === TIMED_OUT ||
      result === ABORTED ||
      signal?.aborted ||
      performance.now() >= deadlineAt
      ? null
      : result
  }
}
