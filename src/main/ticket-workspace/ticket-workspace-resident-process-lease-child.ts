import { Duplex } from 'node:stream'
import type { spawnProcess } from '../../shared/child-process/run-process'

const CHILD_CLEANUP_GRACE_MS = 2_000
const MAX_RESIDENT_STDERR_BYTES = 64 * 1024
type ResidentChild = ReturnType<typeof spawnProcess>
type StderrDrainDisposer = () => void
const residentStderrDrainDisposers = new WeakMap<ResidentChild, StderrDrainDisposer>()
const residentProcessRetirements = new WeakMap<ResidentChild, Promise<void>>()

export function createResidentProcessDuplex(child: ResidentChild, onFailure: () => void): Duplex {
  let stderrBytes = 0
  const stderr = child.stderr
  const duplex = new ResidentProcessDuplex(child)
  child.stdout.on('data', (chunk: Buffer | string) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    if (!duplex.push(bytes)) {
      child.stdout.pause()
    }
  })
  child.stdout.once('end', () => duplex.push(null))
  child.stdout.once('error', onFailure)
  child.stdin.once('error', onFailure)
  const onStderrData = (chunk: Buffer | string): void => {
    stderrBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk)
    if (stderrBytes > MAX_RESIDENT_STDERR_BYTES) {
      onFailure()
    }
  }
  const onStderrError = (): void => onFailure()
  const onRetiredStderrError = (): void => undefined
  let stderrCloseEmitted = stderr.closed
  const onStderrClose = (): void => {
    stderrCloseEmitted = true
    stderr.off('error', onRetiredStderrError)
  }
  if (!stderrCloseEmitted) {
    stderr.once('close', onStderrClose)
  }
  stderr.on('data', onStderrData)
  stderr.on('error', onStderrError)
  residentStderrDrainDisposers.set(child, () => {
    stderr.off('data', onStderrData)
    stderr.off('error', onStderrError)
    stderr.on('error', onRetiredStderrError)
    if (stderrCloseEmitted) {
      stderr.off('error', onRetiredStderrError)
    }
    if (!stderr.destroyed) {
      stderr.destroy()
    }
  })
  return duplex
}

export function waitForResidentProcessSpawn(
  child: ResidentChild,
  retired: Promise<void>
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const cleanup = (): void => {
      child.off('spawn', onSpawn)
      child.off('error', onError)
    }
    const finish = (spawned: boolean): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(spawned)
    }
    const onSpawn = (): void => finish(true)
    const onError = (): void => finish(false)
    child.once('spawn', onSpawn)
    child.once('error', onError)
    void retired.then(() => finish(false))
  })
}

export async function writeResidentLaunchFrame(
  duplex: Duplex,
  frame: Buffer,
  deadline: number,
  now: () => number,
  signal?: AbortSignal
): Promise<void> {
  const remaining = Math.floor(deadline - now())
  if (remaining < 1 || signal?.aborted) {
    throw new Error(signal?.aborted ? 'cancelled' : 'deadline_exceeded')
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let writeDone = false
    let drainDone = true
    let writeAccepted: boolean | undefined
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      if (!error && (!writeDone || !drainDone || writeAccepted === undefined)) {
        return
      }
      settled = true
      clearTimeout(timer)
      duplex.off('drain', onDrain)
      duplex.off('error', onError)
      signal?.removeEventListener('abort', onAbort)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const onDrain = (): void => {
      drainDone = true
      finish()
    }
    const onError = (): void => finish(new Error('disconnected'))
    const onAbort = (): void => finish(new Error('cancelled'))
    const timer = setTimeout(() => finish(new Error('deadline_exceeded')), remaining)
    duplex.once('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      if (now() >= deadline || signal?.aborted) {
        finish(new Error(signal?.aborted ? 'cancelled' : 'deadline_exceeded'))
        return
      }
      writeAccepted = duplex.write(frame, (error?: Error | null) => {
        if (error) {
          finish(error)
          return
        }
        writeDone = true
        finish()
      })
      if (!writeAccepted) {
        drainDone = false
        duplex.once('drain', onDrain)
      }
      finish()
    } catch {
      finish(new Error('disconnected'))
    }
  })
}

export function retireResidentProcessHandle(child: ResidentChild): Promise<void> {
  const existingRetirement = residentProcessRetirements.get(child)
  if (existingRetirement) {
    return existingRetirement
  }
  let resolveRetirement: (() => void) | undefined
  const retirement = new Promise<void>((resolve) => {
    resolveRetirement = resolve
  })
  residentProcessRetirements.set(child, retirement)
  closeResidentProcessStderr(child)
  if (hasClosed(child)) {
    resolveRetirement?.()
    return retirement
  }
  let settled = false
  const finish = (): void => {
    if (settled) {
      return
    }
    settled = true
    clearTimeout(timer)
    child.off('close', finish)
    child.off('error', finish)
    resolveRetirement?.()
  }
  const timer = setTimeout(() => {
    try {
      child.kill()
    } catch {
      // The exact wrapper handle may already be closed.
    }
    finish()
  }, CHILD_CLEANUP_GRACE_MS)
  child.once('close', finish)
  child.once('error', finish)
  try {
    child.kill()
  } catch {
    finish()
  }
  return retirement
}

function closeResidentProcessStderr(child: ResidentChild): void {
  const dispose = residentStderrDrainDisposers.get(child)
  residentStderrDrainDisposers.delete(child)
  if (dispose) {
    dispose()
  } else if (!child.stderr.destroyed) {
    child.stderr.destroy()
  }
}

function hasClosed(child: ResidentChild): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

class ResidentProcessDuplex extends Duplex {
  constructor(private readonly child: ResidentChild) {
    super({ allowHalfOpen: false })
  }

  override _read(): void {
    this.child.stdout.resume()
  }

  override _write(
    chunk: unknown,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    let bytes: Buffer | undefined
    if (Buffer.isBuffer(chunk)) {
      bytes = chunk
    } else if (typeof chunk === 'string') {
      bytes = Buffer.from(chunk, encoding)
    } else if (chunk instanceof Uint8Array) {
      bytes = Buffer.from(chunk)
    }
    if (!bytes) {
      callback(new Error('Resident process writes must be bytes'))
      return
    }
    this.child.stdin.write(bytes, callback)
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.child.stdin.end(() => callback())
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (!this.child.stdin.destroyed) {
      this.child.stdin.destroy()
    }
    if (!this.child.stdout.destroyed) {
      this.child.stdout.destroy()
    }
    callback(error)
  }
}
