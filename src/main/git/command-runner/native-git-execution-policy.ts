import { isWslUncPath } from '../../../shared/wsl-paths'
import type { GitExecOptions } from './git-exec-options'
import type { ResolvedCommand } from './wsl-command-resolution'

export function assertNativeGitExecutionOptions(options: GitExecOptions): void {
  if (
    options.requireNativeExecution &&
    (Boolean(options.wslDistro) || options.preferWslDirectGit === true || isWslUncPath(options.cwd))
  ) {
    throw new Error('native_git_execution_unavailable')
  }
}

export function assertResolvedNativeGitExecution(
  options: GitExecOptions,
  command: ResolvedCommand
): void {
  if (options.requireNativeExecution && (command.wsl !== null || command.wslMode !== null)) {
    throw new Error('native_git_execution_unavailable')
  }
}
