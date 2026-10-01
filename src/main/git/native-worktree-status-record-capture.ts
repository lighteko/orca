import { performance } from 'node:perf_hooks'
import { isWslUncPath } from '../../shared/wsl-paths'
import { gitStreamStdout } from './runner'
import { buildNativeGitSubjectAttestationEnvironment } from './native-worktree-subject-attestation'
import {
  NativeGitStatusRecordParser,
  type NativeGitStatusRecordAccounting
} from './worktree-status-record-parser'

export const NATIVE_GIT_STATUS_RECORD_CAPTURE_TIMEOUT_MS = 5_000

const STATUS_CAPTURE_TIMED_OUT = Symbol('status-capture-timed-out')
const STATUS_CAPTURE_ABORTED = Symbol('status-capture-aborted')

export type NativeGitWorktreeStatusRecordCapture = NativeGitStatusRecordAccounting & {
  executionRoute: 'native'
}

const readBoundedNativeGitWorktreeStatusRecords = createBoundedNativeGitStatusRecordReader(
  readNativeGitWorktreeStatusRecordsOnce
)

export function readNativeGitWorktreeStatusRecords(
  worktreeRoot: string,
  signal?: AbortSignal
): Promise<NativeGitWorktreeStatusRecordCapture | null> {
  if (!worktreeRoot || isWslUncPath(worktreeRoot) || signal?.aborted) {
    return Promise.resolve(null)
  }
  return readBoundedNativeGitWorktreeStatusRecords(worktreeRoot, signal)
}

export function createBoundedNativeGitStatusRecordReader(
  readRecords: (
    worktreeRoot: string,
    signal: AbortSignal
  ) => Promise<NativeGitWorktreeStatusRecordCapture | null>,
  timeoutMs = NATIVE_GIT_STATUS_RECORD_CAPTURE_TIMEOUT_MS
): (
  worktreeRoot: string,
  signal?: AbortSignal
) => Promise<NativeGitWorktreeStatusRecordCapture | null> {
  let readInFlight = false

  return async (worktreeRoot, signal) => {
    if (readInFlight || signal?.aborted) {
      return null
    }
    readInFlight = true
    const deadlineAt = performance.now() + timeoutMs
    const controller = new AbortController()
    const operation = Promise.resolve()
      .then(() => readRecords(worktreeRoot, controller.signal))
      .catch(() => null)
    void operation.then(() => {
      readInFlight = false
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    const deadline = new Promise<typeof STATUS_CAPTURE_TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve(STATUS_CAPTURE_TIMED_OUT)
      }, timeoutMs)
    })
    const aborted = new Promise<typeof STATUS_CAPTURE_ABORTED>((resolve) => {
      if (!signal) {
        return
      }
      onAbort = () => {
        controller.abort()
        resolve(STATUS_CAPTURE_ABORTED)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
      }
    })

    const result = await Promise.race([operation, deadline, aborted])
    if (timer) {
      clearTimeout(timer)
    }
    if (onAbort && signal) {
      signal.removeEventListener('abort', onAbort)
    }
    return result === STATUS_CAPTURE_TIMED_OUT ||
      result === STATUS_CAPTURE_ABORTED ||
      signal?.aborted ||
      performance.now() >= deadlineAt
      ? null
      : result
  }
}

async function readNativeGitWorktreeStatusRecordsOnce(
  worktreeRoot: string,
  signal: AbortSignal
): Promise<NativeGitWorktreeStatusRecordCapture | null> {
  if (signal.aborted || isWslUncPath(worktreeRoot)) {
    return null
  }
  const parser = new NativeGitStatusRecordParser()
  const args = [
    '-c',
    'core.quotePath=true',
    '-c',
    'core.fsmonitor=false',
    '--no-optional-locks',
    'status',
    '--porcelain=v2',
    '--branch',
    '--untracked-files=all',
    '--ignore-submodules=none'
  ]
  const result = await gitStreamStdout(args, {
    cwd: worktreeRoot,
    env: buildNativeGitSubjectAttestationEnvironment(),
    admissionTier: 'status',
    requireNativeExecution: true,
    requireValidUtf8: true,
    waitForTerminationOnStop: true,
    signal,
    onStdout: (chunk) => {
      parser.update(chunk)
      return false
    }
  })
  if (signal.aborted || result.stoppedEarly || result.executionRoute !== 'native') {
    return null
  }
  parser.finish()
  return { ...parser.result(), executionRoute: 'native' }
}
