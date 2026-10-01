import { describe, expect, it, vi } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { canonicalWorktreeIdentity } from '../../shared/worktree/identity'
import type { GitWorktreeInfo } from '../../shared/worktree/types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import type { NativeGitWorktreeRegistrationIdentity } from '../git/worktree-catalog-registration-identity'
import type {
  WorktreeCatalogBindingRequest,
  WorktreeCatalogBindingSourceSnapshot
} from '../persistence/loading-store/worktree-catalog-binding-types'
import { RuntimeWorktreeCatalogBindingCommands } from './runtime-worktree-catalog-binding'
import {
  RuntimeGitSubjectAttestationCommands,
  RuntimeGitSubjectAttestationUnavailableError
} from './runtime-git-subject-attestation'

const WORKTREE_PATH = '/repo/worktree'
const INSTANCE_ID = 'instance-1'
const IDENTITY_KEY = canonicalWorktreeIdentity({
  worktreeId: `repo-1::${WORKTREE_PATH}`,
  executionHostId: LOCAL_EXECUTION_HOST_ID,
  instanceId: INSTANCE_ID
})

function request(): WorktreeCatalogBindingRequest {
  return {
    repositoryId: 'repo-1',
    worktreeId: `repo-1::${WORKTREE_PATH}`,
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    instanceId: INSTANCE_ID,
    identityKey: IDENTITY_KEY
  }
}

function registrationIdentity(): NativeGitWorktreeRegistrationIdentity {
  return {
    fingerprint: 'registration-1',
    worktreeRoot: WORKTREE_PATH,
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

function sourceSnapshot(): WorktreeCatalogBindingSourceSnapshot {
  const repo: Repo = {
    id: 'repo-1',
    path: '/repo',
    displayName: 'repo',
    badgeColor: 'blue',
    addedAt: 1,
    executionHostId: LOCAL_EXECUTION_HOST_ID
  }
  const meta: WorktreeMeta = {
    instanceId: INSTANCE_ID,
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
    lastActivityAt: 1
  }
  return {
    token: { incarnationId: 'incarnation-1', revision: 3 },
    repo,
    meta
  }
}

async function createBinding() {
  const registration = registrationIdentity()
  const gitWorktree: GitWorktreeInfo = {
    path: WORKTREE_PATH,
    head: 'abc123',
    branch: 'refs/heads/feature',
    isBare: false,
    isMainWorktree: false
  }
  return new RuntimeWorktreeCatalogBindingCommands({
    getWorktreeCatalogBindingSourceSnapshot: () => sourceSnapshot(),
    listNativeGitWorktrees: async () => [gitWorktree],
    readWorktreeRegistrationIdentity: async () => registration
  }).resolveExactLocalNativeGitTarget(request())
}

describe('RuntimeGitSubjectAttestationCommands', () => {
  it('returns only an effective subject that matches the exact current registration', async () => {
    const binding = await createBinding()
    const isBindingCurrent = vi.fn(async () => true)
    const readEffectiveSubject = vi.fn(async () => registrationIdentity())
    const commands = new RuntimeGitSubjectAttestationCommands({
      isBindingCurrent,
      readEffectiveSubject
    })

    await expect(commands.attestExactLocalNativeGitSubject(binding)).resolves.toEqual({
      binding,
      effectiveSubject: registrationIdentity()
    })
    expect(isBindingCurrent).toHaveBeenCalledTimes(2)
    expect(readEffectiveSubject).toHaveBeenCalledOnce()
  })

  it('does not read Git when the binding is already stale', async () => {
    const binding = await createBinding()
    const readEffectiveSubject = vi.fn(async () => registrationIdentity())
    const commands = new RuntimeGitSubjectAttestationCommands({
      isBindingCurrent: async () => false,
      readEffectiveSubject
    })

    await expect(commands.attestExactLocalNativeGitSubject(binding)).rejects.toBeInstanceOf(
      RuntimeGitSubjectAttestationUnavailableError
    )
    expect(readEffectiveSubject).not.toHaveBeenCalled()
  })

  it('rejects an effective subject mismatch without returning evidence', async () => {
    const binding = await createBinding()
    const wrongSubject = { ...registrationIdentity(), indexPath: '/repo/.git/index' }
    const isBindingCurrent = vi.fn(async () => true)
    const commands = new RuntimeGitSubjectAttestationCommands({
      isBindingCurrent,
      readEffectiveSubject: async () => wrongSubject
    })

    await expect(commands.attestExactLocalNativeGitSubject(binding)).rejects.toBeInstanceOf(
      RuntimeGitSubjectAttestationUnavailableError
    )
    expect(isBindingCurrent).toHaveBeenCalledOnce()
  })

  it('rejects a binding change during the effective Git probe', async () => {
    const binding = await createBinding()
    const isBindingCurrent = vi
      .fn(async () => true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const commands = new RuntimeGitSubjectAttestationCommands({
      isBindingCurrent,
      readEffectiveSubject: async () => registrationIdentity()
    })

    await expect(commands.attestExactLocalNativeGitSubject(binding)).rejects.toBeInstanceOf(
      RuntimeGitSubjectAttestationUnavailableError
    )
    expect(isBindingCurrent).toHaveBeenCalledTimes(2)
  })

  it('rejects aborted requests before consulting the binding host', async () => {
    const binding = await createBinding()
    const isBindingCurrent = vi.fn(async () => true)
    const readEffectiveSubject = vi.fn(async () => registrationIdentity())
    const commands = new RuntimeGitSubjectAttestationCommands({
      isBindingCurrent,
      readEffectiveSubject
    })
    const controller = new AbortController()
    controller.abort()

    await expect(
      commands.attestExactLocalNativeGitSubject(binding, controller.signal)
    ).rejects.toBeInstanceOf(RuntimeGitSubjectAttestationUnavailableError)
    expect(isBindingCurrent).not.toHaveBeenCalled()
    expect(readEffectiveSubject).not.toHaveBeenCalled()
  })
})
