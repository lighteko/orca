import { posix, win32 } from 'node:path'
import { performance } from 'node:perf_hooks'
import { isWslUncPath } from '../../shared/wsl-paths'
import { areWorktreePathsEqual, resolveRevParsePath } from './worktree-path-comparison'
import { isDeepStrictEqual } from 'node:util'
import {
  readNativeGitWorktreeSubjectFilesystemIdentity,
  type NativeGitWorktreeSubject,
  type NativeGitWorktreeSubjectPaths
} from './worktree-catalog-registration-identity'
import { gitExecFileAsync } from './runner'

export const NATIVE_GIT_SUBJECT_ATTESTATION_TIMEOUT_MS = 5_000

const SUBJECT_PROBE_TIMED_OUT = Symbol('subject-probe-timed-out')
const SUBJECT_PROBE_ABORTED = Symbol('subject-probe-aborted')

const REV_PARSE_SUBJECT_ARGS = [
  'rev-parse',
  '--show-toplevel',
  '--absolute-git-dir',
  '--git-common-dir',
  '--git-path',
  'index'
]

export function createBoundedNativeGitSubjectReader<T>(
  readSubject: (worktreeRoot: string, signal: AbortSignal) => Promise<T | null>,
  timeoutMs = NATIVE_GIT_SUBJECT_ATTESTATION_TIMEOUT_MS
): (worktreeRoot: string, signal?: AbortSignal) => Promise<T | null> {
  let probeInFlight = false

  return async (worktreeRoot, signal) => {
    if (probeInFlight || signal?.aborted) {
      return null
    }
    probeInFlight = true
    const deadlineAt = performance.now() + timeoutMs
    const controller = new AbortController()
    const operation = Promise.resolve()
      .then(() => readSubject(worktreeRoot, controller.signal))
      .catch(() => null)
    void operation.then(() => {
      probeInFlight = false
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    const deadline = new Promise<typeof SUBJECT_PROBE_TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve(SUBJECT_PROBE_TIMED_OUT)
      }, timeoutMs)
    })
    const aborted = new Promise<typeof SUBJECT_PROBE_ABORTED>((resolve) => {
      if (!signal) {
        return
      }
      onAbort = () => {
        controller.abort()
        resolve(SUBJECT_PROBE_ABORTED)
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
    return result === SUBJECT_PROBE_TIMED_OUT ||
      result === SUBJECT_PROBE_ABORTED ||
      signal?.aborted ||
      performance.now() >= deadlineAt
      ? null
      : result
  }
}

const readBoundedNativeGitEffectiveWorktreeSubject = createBoundedNativeGitSubjectReader(
  readNativeGitEffectiveWorktreeSubjectOnce
)

export function readNativeGitEffectiveWorktreeSubject(
  worktreeRoot: string,
  signal?: AbortSignal
): Promise<NativeGitWorktreeSubject | null> {
  if (!worktreeRoot || isWslUncPath(worktreeRoot) || signal?.aborted) {
    return Promise.resolve(null)
  }
  return readBoundedNativeGitEffectiveWorktreeSubject(worktreeRoot, signal)
}

async function readNativeGitEffectiveWorktreeSubjectOnce(
  worktreeRoot: string,
  signal: AbortSignal
): Promise<NativeGitWorktreeSubject | null> {
  if (signal.aborted) {
    return null
  }
  try {
    const { stdout } = await gitExecFileAsync(REV_PARSE_SUBJECT_ARGS, {
      cwd: worktreeRoot,
      env: buildNativeGitSubjectAttestationEnvironment(),
      timeout: NATIVE_GIT_SUBJECT_ATTESTATION_TIMEOUT_MS,
      admissionTier: 'status',
      requireNativeExecution: true,
      signal
    })
    const paths = parseNativeGitSubjectOutput(stdout, worktreeRoot)
    if (!paths || signal.aborted) {
      return null
    }
    const filesystemIdentity = await readNativeGitWorktreeSubjectFilesystemIdentity(paths)
    return !signal.aborted && filesystemIdentity ? { ...paths, filesystemIdentity } : null
  } catch {
    return null
  }
}

export function buildNativeGitSubjectAttestationEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(source)) {
    if (!/^GIT_/i.test(key) && key.toUpperCase() !== 'PWD' && value !== undefined) {
      environment[key] = value
    }
  }
  const emptyHome = platform === 'win32' ? 'NUL' : '/dev/null'
  return {
    ...environment,
    HOME: emptyHome,
    USERPROFILE: emptyHome,
    XDG_CONFIG_HOME: emptyHome,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: emptyHome,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0'
  }
}

export function nativeGitSubjectMatchesRegistration(
  actual: NativeGitWorktreeSubject,
  expected: NativeGitWorktreeSubject
): boolean {
  return (
    areWorktreePathsEqual(actual.worktreeRoot, expected.worktreeRoot) &&
    areWorktreePathsEqual(actual.gitDirectoryPath, expected.gitDirectoryPath) &&
    areWorktreePathsEqual(actual.commonDirectoryPath, expected.commonDirectoryPath) &&
    areWorktreePathsEqual(actual.indexPath, expected.indexPath) &&
    isDeepStrictEqual(actual.filesystemIdentity, expected.filesystemIdentity)
  )
}

function parseNativeGitSubjectOutput(
  output: string,
  worktreeRoot: string
): NativeGitWorktreeSubjectPaths | null {
  if (!output.endsWith('\n') || output.includes('\r')) {
    return null
  }
  const lines = output.slice(0, -1).split('\n')
  if (lines.length !== 4) {
    return null
  }
  const [actualWorktreeRoot, gitDirectoryPath, commonDirectory, indexPath] = lines
  if (
    !actualWorktreeRoot ||
    !gitDirectoryPath ||
    !commonDirectory ||
    !indexPath ||
    !isAbsoluteGitPath(actualWorktreeRoot) ||
    !isAbsoluteGitPath(gitDirectoryPath)
  ) {
    return null
  }
  return {
    worktreeRoot: actualWorktreeRoot,
    gitDirectoryPath,
    commonDirectoryPath: resolveRevParsePath(worktreeRoot, commonDirectory),
    indexPath: resolveRevParsePath(worktreeRoot, indexPath)
  }
}

function isAbsoluteGitPath(value: string): boolean {
  return posix.isAbsolute(value) || win32.isAbsolute(value)
}
