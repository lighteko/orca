import type { GitWorktreeInfo } from '../../shared/worktree/types'
import { isWslUncPath } from '../../shared/wsl-paths'
import { isUnsupportedWorktreeListZError } from '../../shared/git-worktree-command-capabilities'
import { parseWorktreeList } from '../../shared/git-worktree-porcelain-parser'
import { getLocalGitCapabilityCache } from './git-capability-state'
import { WORKTREE_LIST_TIMEOUT_MS } from './worktree-operation-options'
import { gitExecFileAsync } from './runner'

/** Fresh catalog read with no catalog cache, selector fallback, metadata writes, or WSL dispatch. */
export async function listNativeGitWorktreesForCatalog(
  repoPath: string,
  signal?: AbortSignal
): Promise<GitWorktreeInfo[]> {
  if (!repoPath || isWslUncPath(repoPath)) {
    throw new Error('native_git_catalog_unavailable')
  }

  const baseOptions = {
    cwd: repoPath,
    timeout: WORKTREE_LIST_TIMEOUT_MS,
    admissionTier: 'status' as const,
    env: {
      ...withoutGitDiscoveryOverrides(process.env),
      GIT_OPTIONAL_LOCKS: '0'
    },
    ...(signal ? { signal } : {})
  }
  return getLocalGitCapabilityCache({ cwd: repoPath }).runWithFallback(
    'worktree-list-z',
    async () => {
      const { stdout } = await gitExecFileAsync(
        ['-c', 'core.quotePath=true', 'worktree', 'list', '--porcelain', '-z'],
        baseOptions
      )
      return parseCompleteWorktreeList(stdout)
    },
    async () => {
      throw new Error('native_git_catalog_unavailable')
    },
    isUnsupportedWorktreeListZError
  )
}

function withoutGitDiscoveryOverrides(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean = { ...env }
  for (const key of Object.keys(clean)) {
    if (/^GIT_/i.test(key)) {
      delete clean[key]
    }
  }
  return clean
}

function parseCompleteWorktreeList(output: string): GitWorktreeInfo[] {
  if (!output.trim()) {
    throw new Error('native_git_catalog_empty')
  }
  if (!output.endsWith('\0\0')) {
    throw new Error('native_git_catalog_incomplete')
  }
  const blocks = splitNulBlocks(output)
  if (blocks.length === 0) {
    throw new Error('native_git_catalog_empty')
  }
  for (const fields of blocks) {
    const isBare = fields.includes('bare')
    const headFields = fields.filter((field) => field.startsWith('HEAD '))
    const worktreeField = fields.find((field) => field.startsWith('worktree '))
    if (
      fields.filter((field) => field.startsWith('worktree ')).length !== 1 ||
      !worktreeField?.slice('worktree '.length) ||
      (isBare ? headFields.length !== 0 : headFields.length !== 1) ||
      fields.filter((field) => field === 'bare').length > 1 ||
      fields.some((field) => !isSupportedField(field))
    ) {
      throw new Error('native_git_catalog_incomplete')
    }
  }

  const worktrees = parseWorktreeList(output, { nulDelimited: true })
  if (
    worktrees.length !== blocks.length ||
    worktrees.some((worktree) => !worktree.isBare && !worktree.head)
  ) {
    throw new Error('native_git_catalog_incomplete')
  }
  return worktrees
}

function isSupportedField(field: string): boolean {
  return (
    field.startsWith('worktree ') ||
    field.startsWith('HEAD ') ||
    field.startsWith('branch ') ||
    field === 'bare' ||
    field === 'detached' ||
    field === 'sparse' ||
    field === 'locked' ||
    field.startsWith('locked ') ||
    field === 'prunable' ||
    field.startsWith('prunable ')
  )
}

function splitNulBlocks(output: string): string[][] {
  if (!output.includes('\0')) {
    return []
  }
  const blocks: string[][] = []
  let current: string[] = []
  for (const field of output.split('\0')) {
    if (field) {
      current.push(field)
    } else if (current.length > 0) {
      blocks.push(current)
      current = []
    }
  }
  if (current.length > 0) {
    blocks.push(current)
  }
  return blocks
}
