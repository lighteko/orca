import type { ExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { WorktreeMeta } from '../../../shared/worktree/meta-types'

export type WorktreeCatalogBindingRequest = {
  repositoryId: string
  worktreeId: string
  executionHostId: ExecutionHostId
  instanceId: string
  identityKey: string
}

export type WorktreeCatalogBindingToken = {
  incarnationId: string
  revision: number
}

export type WorktreeCatalogBindingSourceSnapshot = {
  token: WorktreeCatalogBindingToken
  repo: Repo
  meta: WorktreeMeta
}
