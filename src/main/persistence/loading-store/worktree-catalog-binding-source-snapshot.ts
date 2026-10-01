import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import {
  normalizeGlobalWindowsRuntimeDefault,
  normalizeProjectRuntimePreference
} from '../../../shared/project-execution-runtime'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type {
  WorktreeCatalogBindingRequest,
  WorktreeCatalogBindingSourceSnapshot
} from './worktree-catalog-binding-types'
import { canonicalWorktreeIdentity } from '../../../shared/worktree/identity'
import { composeWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import { splitWorktreeId } from '../../../shared/worktree/id'
import type { StoreRuntimeState } from './store-runtime-state'

type WorktreeCatalogBindingRuntime = Pick<
  StoreRuntimeState,
  'state' | 'worktreeCatalogBindingRevision' | 'worktreeCatalogIncarnationId'
>

export function getWorktreeCatalogBindingSourceSnapshot(
  runtime: WorktreeCatalogBindingRuntime,
  request: WorktreeCatalogBindingRequest
): WorktreeCatalogBindingSourceSnapshot | null {
  if (
    request.executionHostId !== LOCAL_EXECUTION_HOST_ID ||
    !request.repositoryId ||
    !request.instanceId ||
    !request.identityKey
  ) {
    return null
  }
  const parsed = splitWorktreeId(request.worktreeId)
  if (!parsed || parsed.repoId !== request.repositoryId || !parsed.worktreePath) {
    return null
  }
  if (
    request.identityKey !==
    canonicalWorktreeIdentity({
      worktreeId: request.worktreeId,
      executionHostId: request.executionHostId,
      instanceId: request.instanceId
    })
  ) {
    return null
  }

  const state: PersistedState = runtime.state
  const matchingRepos = state.repos.filter(
    (repo) =>
      repo.id === request.repositoryId &&
      (!repo.executionHostId || repo.executionHostId === LOCAL_EXECUTION_HOST_ID) &&
      !repo.connectionId
  )
  if (matchingRepos.length !== 1 || matchingRepos[0]?.kind === 'folder') {
    return null
  }
  if (process.platform === 'win32' && routesThroughWsl(state, request.repositoryId)) {
    return null
  }

  const alias = composeWorktreeHostIdentity(LOCAL_EXECUTION_HOST_ID, request.worktreeId)
  const identityKeys = state.worktreeIdentityAliases?.[alias]
  if (identityKeys?.length !== 1 || identityKeys[0] !== request.identityKey) {
    return null
  }
  const identityAliasCount = Object.values(state.worktreeIdentityAliases ?? {}).reduce(
    (count, keys) => count + keys.filter((key) => key === request.identityKey).length,
    0
  )
  const meta = state.worktreeMetaByIdentity?.[request.identityKey]
  if (
    identityAliasCount !== 1 ||
    !meta ||
    meta.instanceId !== request.instanceId ||
    meta.hostId !== LOCAL_EXECUTION_HOST_ID
  ) {
    return null
  }

  return {
    token: {
      incarnationId: runtime.worktreeCatalogIncarnationId,
      revision: runtime.worktreeCatalogBindingRevision
    },
    repo: structuredClone(matchingRepos[0]),
    meta: structuredClone(meta)
  }
}

function routesThroughWsl(state: PersistedState, repositoryId: string): boolean {
  const owningProjects = state.projects.filter((project) =>
    project.sourceRepoIds.includes(repositoryId)
  )
  if (owningProjects.length > 1) {
    return true
  }
  const projectPreference = normalizeProjectRuntimePreference(
    owningProjects[0]?.localWindowsRuntimePreference
  )
  return (
    projectPreference.kind === 'wsl' ||
    (projectPreference.kind === 'inherit-global' &&
      normalizeGlobalWindowsRuntimeDefault(state.settings.localWindowsRuntimeDefault).kind ===
        'wsl')
  )
}
