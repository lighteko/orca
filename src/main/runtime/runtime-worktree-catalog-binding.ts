import { isDeepStrictEqual } from 'node:util'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { isWslUncPath } from '../../shared/wsl-paths'
import { splitWorktreeId } from '../../shared/worktree/id'
import { areWorktreePathsEqual, mergeWorktree } from '../ipc/worktree-logic'
import { listNativeGitWorktreesForCatalog } from '../git/worktree-catalog-listing'
import {
  readNativeGitWorktreeRegistrationIdentity,
  type NativeGitWorktreeRegistrationIdentity
} from '../git/worktree-catalog-registration-identity'
import type {
  WorktreeCatalogBindingRequest,
  WorktreeCatalogBindingSourceSnapshot,
  WorktreeCatalogBindingToken
} from '../persistence/loading-store/worktree-catalog-binding-types'
import type { RuntimeGitTarget } from './runtime-git-command-target'

export type ExactLocalNativeGitWorktreeBinding = {
  request: WorktreeCatalogBindingRequest
  token: WorktreeCatalogBindingToken & { registrationFingerprint: string }
  registrationIdentity: NativeGitWorktreeRegistrationIdentity
  target: RuntimeGitTarget
}

export type RuntimeWorktreeCatalogBindingHost = {
  getWorktreeCatalogBindingSourceSnapshot(
    request: WorktreeCatalogBindingRequest
  ): WorktreeCatalogBindingSourceSnapshot | null
  listNativeGitWorktrees(
    repoPath: string,
    signal?: AbortSignal
  ): ReturnType<typeof listNativeGitWorktreesForCatalog>
  readWorktreeRegistrationIdentity(
    repoPath: string,
    worktreePath: string,
    signal?: AbortSignal
  ): Promise<NativeGitWorktreeRegistrationIdentity | null>
}

export class WorktreeCatalogBindingUnavailableError extends Error {
  readonly code = 'worktree_catalog_binding_unavailable'

  constructor() {
    super('The exact local native Git worktree binding is unavailable.')
    this.name = 'WorktreeCatalogBindingUnavailableError'
  }
}

export class RuntimeWorktreeCatalogBindingCommands {
  constructor(
    private readonly host: RuntimeWorktreeCatalogBindingHost = {
      getWorktreeCatalogBindingSourceSnapshot: () => null,
      listNativeGitWorktrees: listNativeGitWorktreesForCatalog,
      readWorktreeRegistrationIdentity: readNativeGitWorktreeRegistrationIdentity
    }
  ) {}

  async resolveExactLocalNativeGitTarget(
    request: WorktreeCatalogBindingRequest,
    signal?: AbortSignal
  ): Promise<ExactLocalNativeGitWorktreeBinding> {
    if (request.executionHostId !== LOCAL_EXECUTION_HOST_ID) {
      throw new WorktreeCatalogBindingUnavailableError()
    }
    const parsedId = splitWorktreeId(request.worktreeId)
    if (!parsedId || parsedId.repoId !== request.repositoryId || !parsedId.worktreePath) {
      throw new WorktreeCatalogBindingUnavailableError()
    }

    const before = this.readSourceSnapshot(request)
    if (
      !before ||
      before.repo.kind === 'folder' ||
      getRepoExecutionHostId(before.repo) !== LOCAL_EXECUTION_HOST_ID ||
      Boolean(before.repo.connectionId) ||
      isWslUncPath(before.repo.path) ||
      isWslUncPath(parsedId.worktreePath)
    ) {
      throw new WorktreeCatalogBindingUnavailableError()
    }

    const registrationBefore = await this.host.readWorktreeRegistrationIdentity(
      before.repo.path,
      parsedId.worktreePath,
      signal
    )
    if (!registrationBefore) {
      throw new WorktreeCatalogBindingUnavailableError()
    }
    const worktrees = await this.host.listNativeGitWorktrees(before.repo.path, signal)
    const matches = worktrees.filter((worktree) =>
      areWorktreePathsEqual(worktree.path, parsedId.worktreePath)
    )
    if (matches.length !== 1 || matches[0]?.isBare || matches[0]?.prunable) {
      throw new WorktreeCatalogBindingUnavailableError()
    }
    const git = matches[0]
    if (!git || git.path !== parsedId.worktreePath) {
      throw new WorktreeCatalogBindingUnavailableError()
    }
    const merged = mergeWorktree(before.repo.id, git, before.meta, before.repo.displayName)
    if (
      merged.id !== request.worktreeId ||
      merged.instanceId !== request.instanceId ||
      merged.identity?.key !== request.identityKey ||
      merged.hostId !== LOCAL_EXECUTION_HOST_ID
    ) {
      throw new WorktreeCatalogBindingUnavailableError()
    }

    const registrationAfter = await this.host.readWorktreeRegistrationIdentity(
      before.repo.path,
      parsedId.worktreePath,
      signal
    )
    const after = this.readSourceSnapshot(request)
    if (
      !registrationAfter ||
      registrationBefore.fingerprint !== registrationAfter.fingerprint ||
      !after ||
      !sameToken(before.token, after.token) ||
      !isDeepStrictEqual(before.repo, after.repo) ||
      !isDeepStrictEqual(before.meta, after.meta)
    ) {
      throw new WorktreeCatalogBindingUnavailableError()
    }

    return {
      request: { ...request },
      token: {
        ...before.token,
        registrationFingerprint: registrationBefore.fingerprint
      },
      registrationIdentity: registrationBefore,
      target: {
        worktree: { ...merged, git },
        repo: before.repo,
        executionHostId: LOCAL_EXECUTION_HOST_ID,
        localGitOptions: {}
      }
    }
  }

  async isExactLocalNativeGitBindingCurrent(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<boolean> {
    try {
      const current = await this.resolveExactLocalNativeGitTarget(binding.request, signal)
      return (
        sameToken(binding.token, current.token) &&
        binding.token.registrationFingerprint === current.token.registrationFingerprint &&
        isDeepStrictEqual(binding.registrationIdentity, current.registrationIdentity) &&
        isDeepStrictEqual(binding.target, current.target)
      )
    } catch {
      return false
    }
  }

  private readSourceSnapshot(
    request: WorktreeCatalogBindingRequest
  ): WorktreeCatalogBindingSourceSnapshot | null {
    return this.host.getWorktreeCatalogBindingSourceSnapshot(request)
  }
}

function sameToken(left: WorktreeCatalogBindingToken, right: WorktreeCatalogBindingToken): boolean {
  return left.incarnationId === right.incarnationId && left.revision === right.revision
}
