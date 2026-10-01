export function waitForResidentSourceAdmission<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
  abandon: () => void
): Promise<T | undefined> {
  if (signal.aborted || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    abandon()
    return Promise.resolve(undefined)
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: T | undefined): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve(value)
    }
    const onAbort = (): void => {
      abandon()
      finish(undefined)
    }
    const timer = setTimeout(onAbort, timeoutMs)
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => finish(value),
      () => finish(undefined)
    )
    if (signal.aborted) {
      onAbort()
    }
  })
}
