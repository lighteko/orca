import ticketSnapshotCorpus from '@lighteko/ticket-workspace-contracts/fixtures/ticket-navigator-snapshot-v1.corpus.json'
import {
  digestNavigatorSnapshotV1,
  validateTicketNavigatorSnapshotV1,
  type TicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { canonicalWorktreeIdentity } from '../../../shared/worktree/identity'
import type { GitWorktreeInfo } from '../../../shared/worktree/types'
import type { WorktreeMeta } from '../../../shared/worktree/meta-types'
import type { NativeGitWorktreeRegistrationIdentity } from '../../git/worktree-catalog-registration-identity'
import type { WorktreeCatalogBindingSourceSnapshot } from '../../persistence/loading-store/worktree-catalog-binding-types'
import { RuntimeWorktreeCatalogBindingCommands } from '../runtime-worktree-catalog-binding'

export const OWNER_TEST_WORKTREE_PATH = '/repo/worktree'
export const OWNER_TEST_INSTANCE_ID = 'instance-1'
export const OWNER_TEST_REPOSITORY_ID = 'common-api'
export const OWNER_TEST_WORKTREE_ID = `${OWNER_TEST_REPOSITORY_ID}::${OWNER_TEST_WORKTREE_PATH}`
export const OWNER_TEST_IDENTITY_KEY = canonicalWorktreeIdentity({
  worktreeId: OWNER_TEST_WORKTREE_ID,
  executionHostId: LOCAL_EXECUTION_HOST_ID,
  instanceId: OWNER_TEST_INSTANCE_ID
})

export type PositiveTicketWorkspaceSnapshotOptions = {
  referenceState?: 'matched' | 'unavailable' | 'unsupported'
  executionHostId?: string
  instanceId?: string
  identityKey?: string
  worktreePath?: string
  removeTarget?: boolean
  folderTarget?: boolean
}

export function validatedFullTicketSnapshot(): TicketNavigatorSnapshotV1 {
  const validation = validateTicketNavigatorSnapshotV1(ticketSnapshotCorpus.bases['snapshot.full'])
  if (validation.schemaVerdict !== 'accepted') {
    throw new Error(`The delivered snapshot.full fixture was rejected: ${validation.reasonCode}`)
  }
  return validation.value
}

export function makePositiveTicketWorkspaceSnapshot(
  options: PositiveTicketWorkspaceSnapshotOptions = {}
): {
  snapshot: TicketNavigatorSnapshotV1
  selector: { ticketKey: string; repositoryId: string }
} {
  const snapshot = structuredClone(validatedFullTicketSnapshot())
  const ticket = snapshot.tickets[0]
  const workspace = ticket?.workspaces.find(
    (candidate) => candidate.repositoryId === OWNER_TEST_REPOSITORY_ID
  )
  if (!ticket || !workspace) {
    throw new Error('The delivered snapshot.full fixture is missing its expected workspace row.')
  }

  const worktreePath = options.worktreePath ?? OWNER_TEST_WORKTREE_PATH
  const worktreeId = `${OWNER_TEST_REPOSITORY_ID}::${worktreePath}`
  const executionHostId = options.executionHostId ?? LOCAL_EXECUTION_HOST_ID
  const instanceId = options.instanceId ?? OWNER_TEST_INSTANCE_ID
  const identityKey =
    options.identityKey ??
    canonicalWorktreeIdentity({ worktreeId, executionHostId: LOCAL_EXECUTION_HOST_ID, instanceId })

  workspace.referenceState = options.referenceState ?? 'matched'
  if (options.removeTarget) {
    delete workspace.target
  } else if (options.folderTarget) {
    workspace.target = {
      schemaVersion: 1,
      kind: 'folder',
      executionHostId,
      repoId: OWNER_TEST_REPOSITORY_ID
    }
  } else {
    workspace.target = {
      schemaVersion: 1,
      kind: 'git-worktree',
      executionHostId,
      identityKey,
      instanceId,
      worktreeId,
      repoId: OWNER_TEST_REPOSITORY_ID
    }
  }
  if (executionHostId.startsWith('ssh:')) {
    ticket.availability = 'unsupported'
    workspace.referenceState = 'unsupported'
  }

  snapshot.snapshotRevision = digestNavigatorSnapshotV1(snapshot)
  const validation = validateTicketNavigatorSnapshotV1(snapshot)
  if (validation.schemaVerdict !== 'accepted') {
    throw new Error(`The synthetic Orca-owned snapshot was rejected: ${validation.reasonCode}`)
  }
  return {
    snapshot: validation.value,
    selector: { ticketKey: ticket.ticketKey, repositoryId: workspace.repositoryId }
  }
}

export function createLocalNativeWorktreeBindingHarness(): {
  commands: RuntimeWorktreeCatalogBindingCommands
  getSourceSnapshot: () => WorktreeCatalogBindingSourceSnapshot
  setSourceSnapshot: (snapshot: WorktreeCatalogBindingSourceSnapshot) => void
  setWorktrees: (worktrees: GitWorktreeInfo[]) => void
  setBeforeList: (callback: (() => void) | null) => void
  getListCallCount: () => number
} {
  let sourceSnapshot = createWorktreeCatalogSourceSnapshot()
  let worktrees = [localNativeWorktree()]
  let beforeList: (() => void) | null = null
  let listCallCount = 0
  const commands = new RuntimeWorktreeCatalogBindingCommands({
    getWorktreeCatalogBindingSourceSnapshot: () => sourceSnapshot,
    listNativeGitWorktrees: async () => {
      listCallCount += 1
      beforeList?.()
      return worktrees
    },
    readWorktreeRegistrationIdentity: async () => localNativeRegistrationIdentity()
  })
  return {
    commands,
    getSourceSnapshot: () => sourceSnapshot,
    setSourceSnapshot: (snapshot) => {
      sourceSnapshot = snapshot
    },
    setWorktrees: (nextWorktrees) => {
      worktrees = nextWorktrees
    },
    setBeforeList: (callback) => {
      beforeList = callback
    },
    getListCallCount: () => listCallCount
  }
}

export function createWorktreeCatalogSourceSnapshot(
  overrides: {
    incarnationId?: string
    revision?: number
    repo?: Partial<Repo>
    meta?: Partial<WorktreeMeta>
  } = {}
): WorktreeCatalogBindingSourceSnapshot {
  const repo: Repo = {
    id: OWNER_TEST_REPOSITORY_ID,
    path: '/repo',
    displayName: 'repo',
    badgeColor: 'blue',
    addedAt: 1,
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    ...overrides.repo
  }
  const meta: WorktreeMeta = {
    instanceId: OWNER_TEST_INSTANCE_ID,
    hostId: LOCAL_EXECUTION_HOST_ID,
    displayName: 'worktree',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    ...overrides.meta
  }
  return {
    token: {
      incarnationId: overrides.incarnationId ?? 'incarnation-1',
      revision: overrides.revision ?? 3
    },
    repo,
    meta
  }
}

export function localNativeWorktree(overrides: Partial<GitWorktreeInfo> = {}): GitWorktreeInfo {
  return {
    path: OWNER_TEST_WORKTREE_PATH,
    head: 'abc123',
    branch: 'refs/heads/feature',
    isBare: false,
    isMainWorktree: false,
    ...overrides
  }
}

function localNativeRegistrationIdentity(): NativeGitWorktreeRegistrationIdentity {
  return {
    fingerprint: 'registration-1',
    worktreeRoot: OWNER_TEST_WORKTREE_PATH,
    gitDirectoryPath: '/repo/.git/worktrees/feature',
    commonDirectoryPath: '/repo/.git',
    indexPath: '/repo/.git/worktrees/feature/index',
    filesystemIdentity: {
      worktreeRoot: filesystemIdentity('2', 'directory'),
      gitDirectoryPath: filesystemIdentity('3', 'directory'),
      commonDirectoryPath: filesystemIdentity('4', 'directory'),
      indexPath: null
    }
  }
}

function filesystemIdentity(
  inode: string,
  kind: 'file' | 'directory'
): NativeGitWorktreeRegistrationIdentity['filesystemIdentity']['worktreeRoot'] {
  return {
    device: '1',
    inode,
    birthtimeNs: '3',
    ctimeNs: '4',
    mtimeNs: '5',
    size: '6',
    kind
  }
}
