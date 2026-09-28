import { withGitSpan } from '../../observability/instrumentation'
import {
  isWslLinkedWorktreeGitRoutingCandidate,
  prepareWslLinkedWorktreeGitRouting
} from '../wsl-linked-worktree-git-routing'
import type { ResolvedCommand } from './wsl-command-resolution'
import { DEFAULT_GIT_MAX_BUFFER, type GitExecOptions } from './git-exec-options'
import {
  pendingWslDirectGitReadEnvironment,
  directWslGitExitCode,
  disableDirectWslGitAfterSuccessfulFallback,
  invalidateMissingDirectWslGit,
  resolveGitCommand,
  resolveGitCommandWithoutProbe
} from './git-command-resolution'
import { prepareWindowsHostGitEnvironment } from './windows-host-git-environment'
import { acquireGitAdmission } from './git-subprocess-admission'
import { gitCommandTimeoutMs } from './git-command-timeout'
import {
  assertNativeGitExecutionOptions,
  assertResolvedNativeGitExecution
} from './native-git-execution-policy'
import {
  streamGitChild,
  type GitStreamExecutionRoute,
  type GitStreamTerminationState
} from './git-stream-child'

/** Result of a streamed git command; `stoppedEarly` is true when onStdout asked to stop before the child exited. */
export type GitStreamResult = { stoppedEarly: boolean; executionRoute?: 'native' | 'wsl' }

export type GitStreamOptions = {
  cwd: string
  env?: NodeJS.ProcessEnv
  wslDistro?: string
  preferWslDirectGit?: boolean
  signal?: AbortSignal
  /** Byte backstop; defaults to DEFAULT_GIT_MAX_BUFFER. */
  maxBuffer?: number
  /** Explicit wall-clock deadline; read commands default to the production backstop. */
  timeoutMs?: number
  /** Overrides only the default read deadline in tests. */
  timeoutMsForTest?: number
  admissionTier?: GitExecOptions['admissionTier']
  /** Reject WSL routes and report the route selected immediately before spawn. */
  requireNativeExecution?: boolean
  /** Reject stdout that is not valid UTF-8, including an incomplete final sequence. */
  requireValidUtf8?: boolean
  /** Resolve only after a stopped/aborted/timed-out child has closed. */
  waitForTerminationOnStop?: boolean
  /** Called for each decoded stdout chunk. Return true to stop the child. */
  onStdout: (chunk: string) => boolean | void
}

/** Stream git stdout incrementally so large results remain bounded in memory. */
export async function gitStreamStdout(
  args: string[],
  options: GitStreamOptions
): Promise<GitStreamResult> {
  const maxBuffer = options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER
  const timeoutMs = gitCommandTimeoutMs(args, options.timeoutMs, options.timeoutMsForTest)
  return withGitSpan({ args, cwd: options.cwd }, async (span) => {
    assertNativeGitExecutionOptions(options)
    if (isWslLinkedWorktreeGitRoutingCandidate(options.cwd, options.wslDistro)) {
      await prepareWslLinkedWorktreeGitRouting(options.cwd, options.wslDistro, {
        signal: options.signal
      })
    }
    const gitOptions: GitExecOptions = {
      cwd: options.cwd,
      ...(options.env ? { env: options.env } : {}),
      ...(options.wslDistro ? { wslDistro: options.wslDistro } : {}),
      ...(options.preferWslDirectGit ? { preferWslDirectGit: true } : {}),
      ...(options.requireNativeExecution ? { requireNativeExecution: true } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.admissionTier ? { admissionTier: options.admissionTier } : {})
    }
    const readEnvironmentReady = pendingWslDirectGitReadEnvironment(args, gitOptions)
    if (readEnvironmentReady) {
      await readEnvironmentReady
    }
    let resolved = resolveGitCommand(args, gitOptions)
    assertResolvedNativeGitExecution(gitOptions, resolved)
    const environmentReady = prepareWindowsHostGitEnvironment(
      resolved,
      gitOptions.env,
      options.signal
    )
    if (environmentReady) {
      gitOptions.env = await environmentReady
    }
    resolved = resolveGitCommand(args, gitOptions)
    assertResolvedNativeGitExecution(gitOptions, resolved)
    const grant = await acquireGitAdmission({
      args,
      cwd: options.cwd,
      wslDistro: options.wslDistro,
      tier: options.admissionTier,
      signal: options.signal
    })
    span?.setAttribute('git.queue_wait_ms', grant.queueWaitMs)
    const terminationState: GitStreamTerminationState = { current: null }
    const executionRoute: GitStreamExecutionRoute = { current: undefined }
    const observeSpawnRoute = (command: ResolvedCommand): void => {
      executionRoute.current = command.wsl === null && command.wslMode === null ? 'native' : 'wsl'
      if (options.requireNativeExecution && executionRoute.current !== 'native') {
        throw new Error('native_git_execution_unavailable')
      }
    }
    const stream = (command: ResolvedCommand): Promise<GitStreamResult> =>
      streamGitChild(
        args,
        command,
        options,
        gitOptions,
        timeoutMs,
        maxBuffer,
        terminationState,
        executionRoute,
        observeSpawnRoute
      )
    try {
      try {
        return await stream(resolved)
      } catch (error) {
        const stdoutBytes =
          error && typeof error === 'object'
            ? (error as { stdoutBytes?: unknown }).stdoutBytes
            : null
        if (
          stdoutBytes === 0 &&
          directWslGitExitCode(error, resolved) !== null &&
          !options.signal?.aborted
        ) {
          await terminationState.current
          const wasMissing = invalidateMissingDirectWslGit(error, resolved)
          resolved = resolveGitCommandWithoutProbe(args, gitOptions)
          const result = await stream(resolved)
          disableDirectWslGitAfterSuccessfulFallback(wasMissing, resolved)
          return result
        }
        throw error
      }
    } finally {
      const termination = terminationState.current
      if (termination) {
        void termination.then(grant.release)
      } else {
        grant.release()
      }
    }
  })
}
