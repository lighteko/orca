import { describe, expect, it, vi } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { canonicalWorktreeIdentity } from '../../shared/worktree/identity'
import type { GitWorktreeInfo } from '../../shared/worktree/types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { createBoundedWorktreeRegistrationIdentityReader } from '../git/bounded-worktree-registration-probe'
import type { NativeGitWorktreeRegistrationIdentity } from '../git/worktree-catalog-registration-identity'
import type {
  WorktreeCatalogBindingRequest,
  WorktreeCatalogBindingSourceSnapshot
} from '../persistence/loading-store/worktree-catalog-binding-types'
import {
  RuntimeWorktreeCatalogBindingCommands,
  WorktreeCatalogBindingUnavailableError
} from './runtime-worktree-catalog-binding'

const WORKTREE_PATH = '/repo/worktree'
const INSTANCE_ID = 'instance-1'
const IDENTITY_KEY = canonicalWorktreeIdentity({
  worktreeId: `repo-1::${WORKTREE_PATH}`,
  executionHostId: LOCAL_EXECUTION_HOST_ID,
  instanceId: INSTANCE_ID
})

function request(
  overrides: Partial<WorktreeCatalogBindingRequest> = {}
): WorktreeCatalogBindingRequest {
  return {
    repositoryId: 'repo-1',
    worktreeId: `repo-1::${WORKTREE_PATH}`,
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    instanceId: INSTANCE_ID,
    identityKey: IDENTITY_KEY,
    ...overrides
  }
}

function sourceSnapshot(
  overrides: {
    token?: Partial<WorktreeCatalogBindingSourceSnapshot['token']>
    repo?: Partial<Repo>
    meta?: Partial<WorktreeMeta>
  } = {}
): WorktreeCatalogBindingSourceSnapshot {
  const repo: Repo = {
    id: 'repo-1',
    path: '/repo',
    displayName: 'repo',
    badgeColor: 'blue',
    addedAt: 1,
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    ...overrides.repo
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
    lastActivityAt: 1,
    ...overrides.meta
  }
  return {
    token: { incarnationId: 'incarnation-1', revision: 3, ...overrides.token },
    repo,
    meta
  }
}

function gitWorktree(overrides: Partial<GitWorktreeInfo> = {}): GitWorktreeInfo {
  return {
    path: WORKTREE_PATH,
    head: 'abc123',
    branch: 'refs/heads/feature',
    isBare: false,
    isMainWorktree: false,
    ...overrides
  }
}

function registrationIdentity(fingerprint: string): NativeGitWorktreeRegistrationIdentity {
  return {
    fingerprint,
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

function commands(
  snapshot: () => WorktreeCatalogBindingSourceSnapshot | null,
  rows: () => Promise<GitWorktreeInfo[]>,
  registration: () => Promise<NativeGitWorktreeRegistrationIdentity | null> = async () =>
    registrationIdentity('registration-1')
): RuntimeWorktreeCatalogBindingCommands {
  return new RuntimeWorktreeCatalogBindingCommands({
    getWorktreeCatalogBindingSourceSnapshot: snapshot,
    listNativeGitWorktrees: rows,
    readWorktreeRegistrationIdentity: registration
  })
}

describe('RuntimeWorktreeCatalogBindingCommands', () => {
  it('binds one exact current Git row and resolved local target without a selector cache', async () => {
    const source = sourceSnapshot()
    const readSource = vi.fn(() => source)
    const readGit = vi.fn(async () => [gitWorktree()])
    const bindingCommands = commands(readSource, readGit)

    const binding = await bindingCommands.resolveExactLocalNativeGitTarget(request())

    expect(binding.token).toMatchObject({
      ...source.token,
      registrationFingerprint: 'registration-1'
    })
    expect(binding.target).toMatchObject({
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      localGitOptions: {},
      repo: { id: 'repo-1', path: '/repo' },
      worktree: {
        id: `repo-1::${WORKTREE_PATH}`,
        path: WORKTREE_PATH,
        instanceId: INSTANCE_ID,
        identity: { key: IDENTITY_KEY },
        git: { head: 'abc123', branch: 'refs/heads/feature' }
      }
    })
    expect(readSource).toHaveBeenCalledTimes(2)
    expect(readGit).toHaveBeenCalledOnce()
  })

  it('rejects unsupported host, folder, WSL, missing, prunable, duplicate, or rebound subjects', async () => {
    const source = sourceSnapshot()
    const readGit = vi.fn(async () => [gitWorktree()])
    const remoteCommands = commands(
      vi.fn(() => source),
      readGit
    )
    await expect(
      remoteCommands.resolveExactLocalNativeGitTarget(request({ executionHostId: 'ssh:builder' }))
    ).rejects.toBeInstanceOf(WorktreeCatalogBindingUnavailableError)
    expect(readGit).not.toHaveBeenCalled()

    const folderCommands = commands(
      vi.fn(() => sourceSnapshot({ repo: { kind: 'folder' } })),
      readGit
    )
    await expect(folderCommands.resolveExactLocalNativeGitTarget(request())).rejects.toBeInstanceOf(
      WorktreeCatalogBindingUnavailableError
    )

    const wslCommands = commands(
      vi.fn(() => sourceSnapshot({ repo: { path: '\\\\wsl.localhost\\Ubuntu\\repo' } })),
      readGit
    )
    await expect(wslCommands.resolveExactLocalNativeGitTarget(request())).rejects.toBeInstanceOf(
      WorktreeCatalogBindingUnavailableError
    )

    for (const rows of [[], [gitWorktree({ prunable: true })], [gitWorktree(), gitWorktree()]]) {
      await expect(
        commands(
          vi.fn(() => source),
          async () => rows
        ).resolveExactLocalNativeGitTarget(request())
      ).rejects.toBeInstanceOf(WorktreeCatalogBindingUnavailableError)
    }

    const changedSource = vi
      .fn<() => WorktreeCatalogBindingSourceSnapshot | null>()
      .mockReturnValueOnce(source)
      .mockReturnValueOnce({ ...source, token: { ...source.token, revision: 4 } })
    await expect(
      commands(changedSource, readGit).resolveExactLocalNativeGitTarget(request())
    ).rejects.toBeInstanceOf(WorktreeCatalogBindingUnavailableError)
  })

  it('revalidates the full binding after an async gap and fails closed on token or target change', async () => {
    const source = sourceSnapshot()
    const readSource = vi.fn(() => source)
    const readGit = vi.fn(async () => [gitWorktree()])
    const bindingCommands = commands(readSource, readGit)
    const binding = await bindingCommands.resolveExactLocalNativeGitTarget(request())

    await expect(bindingCommands.isExactLocalNativeGitBindingCurrent(binding)).resolves.toBe(true)

    readSource.mockImplementation(() => ({
      ...source,
      token: { ...source.token, revision: source.token.revision + 1 }
    }))
    await expect(bindingCommands.isExactLocalNativeGitBindingCurrent(binding)).resolves.toBe(false)

    readSource.mockImplementation(() => source)
    readGit.mockImplementation(async () => [gitWorktree({ head: 'changed-head' })])
    await expect(bindingCommands.isExactLocalNativeGitBindingCurrent(binding)).resolves.toBe(false)
  })

  it('checks the captured catalog incarnation and revision synchronously without Git reads', async () => {
    const initial = sourceSnapshot()
    let current: WorktreeCatalogBindingSourceSnapshot | null = initial
    const readSource = vi.fn(() => current)
    const readGit = vi.fn(async () => [gitWorktree()])
    const readRegistration = vi.fn(async () => registrationIdentity('registration-1'))
    const bindingCommands = new RuntimeWorktreeCatalogBindingCommands({
      getWorktreeCatalogBindingSourceSnapshot: readSource,
      listNativeGitWorktrees: readGit,
      readWorktreeRegistrationIdentity: readRegistration
    })
    const binding = await bindingCommands.resolveExactLocalNativeGitTarget(request())
    readSource.mockClear()

    expect(bindingCommands.isExactLocalNativeGitBindingCatalogCurrent(binding)).toBe(true)
    expect(readSource).toHaveBeenCalledOnce()
    expect(readGit).toHaveBeenCalledOnce()
    expect(readRegistration).toHaveBeenCalledTimes(2)

    current = { ...initial, token: { ...initial.token, revision: initial.token.revision + 1 } }
    expect(bindingCommands.isExactLocalNativeGitBindingCatalogCurrent(binding)).toBe(false)
    current = { ...initial, token: { ...initial.token, incarnationId: 'replacement' } }
    expect(bindingCommands.isExactLocalNativeGitBindingCatalogCurrent(binding)).toBe(false)
    current = null
    expect(bindingCommands.isExactLocalNativeGitBindingCatalogCurrent(binding)).toBe(false)
    expect(readGit).toHaveBeenCalledOnce()
    expect(readRegistration).toHaveBeenCalledTimes(2)
  })

  it('rejects an external Git registration ABA even when the porcelain target is unchanged', async () => {
    const source = sourceSnapshot()
    const readSource = vi.fn(() => source)
    const readGit = vi.fn(async () => [gitWorktree()])
    const readRegistration = vi
      .fn<() => Promise<NativeGitWorktreeRegistrationIdentity | null>>()
      .mockResolvedValueOnce(registrationIdentity('old-registration'))
      .mockResolvedValueOnce(registrationIdentity('old-registration'))
      .mockResolvedValueOnce(registrationIdentity('new-registration'))
      .mockResolvedValueOnce(registrationIdentity('new-registration'))
    const bindingCommands = commands(readSource, readGit, readRegistration)
    const binding = await bindingCommands.resolveExactLocalNativeGitTarget(request())

    await expect(bindingCommands.isExactLocalNativeGitBindingCurrent(binding)).resolves.toBe(false)
    expect(readGit).toHaveBeenCalledTimes(2)
  })

  it('rejects a registration change while the native catalog is being read', async () => {
    const source = sourceSnapshot()
    const readRegistration = vi
      .fn<() => Promise<NativeGitWorktreeRegistrationIdentity | null>>()
      .mockResolvedValueOnce(registrationIdentity('before-list'))
      .mockResolvedValueOnce(registrationIdentity('after-list'))

    await expect(
      commands(
        vi.fn(() => source),
        async () => [gitWorktree()],
        readRegistration
      ).resolveExactLocalNativeGitTarget(request())
    ).rejects.toBeInstanceOf(WorktreeCatalogBindingUnavailableError)
  })

  it('fails binding resolution within the registration probe deadline', async () => {
    const source = sourceSnapshot()
    const neverSettlingRead = vi.fn(
      () => new Promise<NativeGitWorktreeRegistrationIdentity | null>(() => {})
    )
    const readBoundedIdentity = createBoundedWorktreeRegistrationIdentityReader(
      neverSettlingRead,
      5
    )
    const bindingCommands = new RuntimeWorktreeCatalogBindingCommands({
      getWorktreeCatalogBindingSourceSnapshot: () => source,
      listNativeGitWorktrees: async () => [gitWorktree()],
      readWorktreeRegistrationIdentity: readBoundedIdentity
    })

    await expect(
      bindingCommands.resolveExactLocalNativeGitTarget(request())
    ).rejects.toBeInstanceOf(WorktreeCatalogBindingUnavailableError)
    expect(neverSettlingRead).toHaveBeenCalledOnce()
  })
})
