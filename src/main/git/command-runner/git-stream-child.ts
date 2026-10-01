import { performance } from 'node:perf_hooks'
import { StringDecoder } from 'node:string_decoder'
import { spawnProcess } from '../../../shared/child-process/run-process'
import type { ProcessSpec } from '../../../shared/child-process/process-spec'
import { recordSubprocessSpawn } from '../../diagnostics/main-thread-churn-probe'
import { createAbortError } from './abort-error'
import { killSpawnedCommandTree } from './spawned-command-tree-kill'
import type { ResolvedCommand } from './wsl-command-resolution'
import type { GitExecOptions } from './git-exec-options'
import { nonInteractiveGitEnv, untranslatedGitOutputEnv } from './git-process-env'
import { gitSpawn } from './git-spawn'
import { GitCommandTimeoutError } from './git-command-timeout'
import type { GitStreamOptions, GitStreamResult } from './git-stream-stdout'

export type GitStreamTerminationState = { current: Promise<void> | null }
export type GitStreamExecutionRoute = { current: 'native' | 'wsl' | undefined }

export function streamGitChild(
  args: string[],
  command: ResolvedCommand,
  options: GitStreamOptions,
  gitOptions: GitExecOptions,
  timeoutMs: number | undefined,
  maxBuffer: number,
  terminationState: GitStreamTerminationState,
  executionRoute: GitStreamExecutionRoute,
  observeSpawnRoute: (command: ResolvedCommand) => void
): Promise<GitStreamResult> {
  return new Promise<GitStreamResult>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(createAbortError())
      return
    }
    const stdio: ProcessSpec['stdio'] = ['ignore', 'pipe', 'pipe']
    const spawnOptions = {
      cwd: options.cwd,
      env: nonInteractiveGitEnv(gitOptions.env),
      stdio,
      wslDistro: options.wslDistro,
      windowsHide: true
    }
    let child: ReturnType<typeof gitSpawn>
    if (command.wslMode === 'direct-git') {
      observeSpawnRoute(command)
      const spawnStartedAt = performance.now()
      child = spawnProcess({
        program: command.binary,
        args: command.args,
        cwd: command.cwd,
        env: untranslatedGitOutputEnv(spawnOptions.env),
        stdio: spawnOptions.stdio
      })
      recordSubprocessSpawn(command.binary, command.args, performance.now() - spawnStartedAt)
    } else {
      child = gitSpawn(args, spawnOptions, observeSpawnRoute)
    }
    let terminationReported = false
    terminationState.current = new Promise<void>((resolveTermination) => {
      const reportTermination = (): void => {
        if (terminationReported) {
          return
        }
        terminationReported = true
        resolveTermination()
      }
      child.once('close', reportTermination)
      child.once('error', () => {
        if (!child.pid) {
          reportTermination()
        }
      })
    })

    let settled = false
    let terminationPending = false
    let pendingTerminationError: Error | null = null
    let commandTreeTermination: Promise<void> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let stoppedEarly = false
    let stdoutBytes = 0
    let stderr = ''
    let stderrBytes = 0
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    const stdoutUtf8Validator = options.requireValidUtf8
      ? new TextDecoder('utf-8', { fatal: true })
      : undefined

    const cleanup = (): void => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      child.stdout?.off('data', onStdoutData)
      child.stderr?.off('data', onStderrData)
      child.off('error', onError)
      child.off('close', onClose)
      options.signal?.removeEventListener('abort', onAbort)
      stdoutDecoder.end()
      stderrDecoder.end()
    }
    const finish = (error: Error | null): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      if (error) {
        reject(Object.assign(error, { stderr, stdoutBytes }))
        return
      }
      resolve({
        stoppedEarly,
        ...(options.requireNativeExecution && executionRoute.current
          ? { executionRoute: executionRoute.current }
          : {})
      })
    }
    const settleAfterStop = (error: Error | null): void => {
      if (settled || terminationPending) {
        return
      }
      commandTreeTermination ??= killSpawnedCommandTree(child)
      if (!options.waitForTerminationOnStop || !terminationState.current) {
        finish(error)
        return
      }
      terminationPending = true
      pendingTerminationError = error
      void Promise.allSettled([terminationState.current, commandTreeTermination]).then(
        ([, treeTermination]) =>
          finish(
            treeTermination.status === 'rejected'
              ? (pendingTerminationError ?? new Error('git termination was not confirmed.'))
              : pendingTerminationError
          )
      )
    }

    function onStdoutData(chunk: Buffer): void {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > maxBuffer) {
        settleAfterStop(new Error('git stdout exceeded maxBuffer.'))
        return
      }
      try {
        stdoutUtf8Validator?.decode(chunk, { stream: true })
      } catch (error) {
        settleAfterStop(error instanceof Error ? error : new Error(String(error)))
        return
      }
      const decoded = stdoutDecoder.write(chunk)
      if (decoded.length === 0) {
        return
      }
      let shouldStop: boolean | void
      try {
        shouldStop = options.onStdout(decoded)
      } catch (error) {
        settleAfterStop(error instanceof Error ? error : new Error(String(error)))
        return
      }
      if (shouldStop === true) {
        stoppedEarly = true
        settleAfterStop(null)
      }
    }
    function onStderrData(chunk: Buffer): void {
      stderrBytes += chunk.byteLength
      if (stderrBytes > maxBuffer) {
        settleAfterStop(new Error('git stderr exceeded maxBuffer.'))
        return
      }
      stderr += stderrDecoder.write(chunk)
    }
    function onError(error: Error): void {
      if (options.waitForTerminationOnStop) {
        settleAfterStop(error)
        return
      }
      finish(error)
    }
    function onClose(code: number | null): void {
      if (terminationPending) {
        return
      }
      try {
        stdoutUtf8Validator?.decode()
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
        return
      }
      if (stoppedEarly || code === 0) {
        finish(null)
        return
      }
      finish(Object.assign(new Error(`git exited with ${code}: ${stderr}`), { code }))
    }
    function onAbort(): void {
      if (!child.pid) {
        child.once('error', () => {})
      }
      settleAfterStop(createAbortError())
    }
    function onTimeout(): void {
      if (timeoutMs !== undefined) {
        settleAfterStop(new GitCommandTimeoutError(timeoutMs))
      }
    }

    child.stdout?.on('data', onStdoutData)
    child.stderr?.on('data', onStderrData)
    child.on('error', onError)
    child.on('close', onClose)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (timeoutMs !== undefined && timeoutMs > 0) {
      timeoutTimer = setTimeout(onTimeout, timeoutMs)
    }
    if (options.signal?.aborted) {
      onAbort()
    }
  })
}
