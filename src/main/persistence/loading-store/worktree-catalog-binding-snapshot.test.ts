import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { canonicalWorktreeIdentity } from '../../../shared/worktree/identity'
import { composeWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import type { WorktreeCatalogBindingRequest } from './worktree-catalog-binding-types'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'orca-test',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: { on: () => {}, handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] }
}))

const { Store } = await import('./store')

const stores: InstanceType<typeof Store>[] = []

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.freezeWrites()
  }
})

function createStore(): InstanceType<typeof Store> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-catalog-binding-')))
  const store = new Store({ dataFile: join(directory, 'orca-data.json') })
  stores.push(store)
  return store
}

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    path: join(tmpdir(), 'orca-catalog-repo'),
    displayName: 'catalog-repo',
    badgeColor: 'blue',
    addedAt: Date.now(),
    ...overrides
  }
}

function request(
  overrides: Partial<WorktreeCatalogBindingRequest> = {}
): WorktreeCatalogBindingRequest {
  const worktreeId = `repo-1::${join(tmpdir(), 'orca-catalog-worktree')}`
  const instanceId = 'instance-1'
  return {
    repositoryId: 'repo-1',
    worktreeId,
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    instanceId,
    identityKey: canonicalWorktreeIdentity({
      worktreeId,
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      instanceId
    }),
    ...overrides
  }
}

function registerExactWorktree(
  store: InstanceType<typeof Store>,
  repoRow: Repo = repo(),
  expected = request()
): void {
  store.addRepo(repoRow)
  store.setWorktreeMetaForHost(expected.worktreeId, LOCAL_EXECUTION_HOST_ID, {
    instanceId: expected.instanceId,
    displayName: 'catalog-worktree'
  })
}

describe('Store.getWorktreeCatalogBindingSourceSnapshot', () => {
  it('returns a read-only, host-qualified source snapshot with a process incarnation token', () => {
    const store = createStore()
    const expected = request()
    registerExactWorktree(store, repo(), expected)

    const snapshot = store.getWorktreeCatalogBindingSourceSnapshot(expected)

    expect(snapshot).toMatchObject({
      repo: { id: expected.repositoryId },
      meta: { instanceId: expected.instanceId, hostId: LOCAL_EXECUTION_HOST_ID },
      token: { incarnationId: expect.any(String), revision: expect.any(Number) }
    })
    expect(
      store.getWorktreeMetaForHost(expected.worktreeId, LOCAL_EXECUTION_HOST_ID)
    ).toMatchObject({
      instanceId: expected.instanceId
    })
  })

  it('advances the binding revision after persisted identity changes', () => {
    const store = createStore()
    const expected = request()
    registerExactWorktree(store, repo(), expected)
    const before = store.getWorktreeCatalogBindingSourceSnapshot(expected)

    store.setWorktreeMetaForHost(expected.worktreeId, LOCAL_EXECUTION_HOST_ID, {
      comment: 'changed'
    })
    const after = store.getWorktreeCatalogBindingSourceSnapshot(expected)

    expect(before).not.toBeNull()
    expect(after?.token.incarnationId).toBe(before?.token.incarnationId)
    expect(after?.token.revision).toBeGreaterThan(before?.token.revision ?? -1)
  })

  it('uses a different incarnation for another Store instance', () => {
    const expected = request()
    const first = createStore()
    const second = createStore()
    registerExactWorktree(first, repo(), expected)
    registerExactWorktree(second, repo(), expected)

    expect(first.getWorktreeCatalogBindingSourceSnapshot(expected)?.token.incarnationId).not.toBe(
      second.getWorktreeCatalogBindingSourceSnapshot(expected)?.token.incarnationId
    )
  })

  it('rejects legacy, ambiguous, folder, and non-local source rows without migrating them', () => {
    const legacyStore = createStore()
    const expected = request()
    legacyStore.addRepo(repo())
    legacyStore.setWorktreeMeta(expected.worktreeId, { displayName: 'legacy' })
    const legacyMetaBeforeRead = legacyStore.getWorktreeMeta(expected.worktreeId)

    expect(legacyStore.getWorktreeCatalogBindingSourceSnapshot(expected)).toBeNull()
    expect(legacyStore.getWorktreeMeta(expected.worktreeId)).toEqual(legacyMetaBeforeRead)

    const duplicateStore = createStore()
    registerExactWorktree(duplicateStore, repo(), expected)
    duplicateStore.addRepo(repo())
    expect(duplicateStore.getWorktreeCatalogBindingSourceSnapshot(expected)).toBeNull()

    const folderStore = createStore()
    registerExactWorktree(folderStore, repo({ kind: 'folder' }), expected)
    expect(folderStore.getWorktreeCatalogBindingSourceSnapshot(expected)).toBeNull()

    const remoteRequest = request({ executionHostId: 'ssh:builder' })
    expect(folderStore.getWorktreeCatalogBindingSourceSnapshot(remoteRequest)).toBeNull()
  })

  it('rejects identity aliases that are not the exact locator-owner pair', () => {
    const store = createStore()
    const expected = request()
    registerExactWorktree(store, repo(), expected)

    expect(
      store.getWorktreeCatalogBindingSourceSnapshot({
        ...expected,
        worktreeId: `${expected.worktreeId}-other`
      })
    ).toBeNull()
    expect(
      store.getWorktreeCatalogBindingSourceSnapshot({ ...expected, instanceId: 'other-instance' })
    ).toBeNull()
    expect(
      store.getWorktreeCatalogBindingSourceSnapshot({
        ...expected,
        identityKey: composeWorktreeHostIdentity(LOCAL_EXECUTION_HOST_ID, expected.worktreeId)
      })
    ).toBeNull()
  })

  it('rejects Windows repos routed through WSL instead of native Git', () => {
    if (process.platform !== 'win32') {
      return
    }

    const projectOverrideStore = createStore()
    const expected = request()
    registerExactWorktree(projectOverrideStore, repo(), expected)
    const project = projectOverrideStore.getProjects()[0]
    expect(project).toBeDefined()
    if (!project) {
      return
    }
    projectOverrideStore.updateProject(project.id, {
      localWindowsRuntimePreference: { kind: 'wsl', distro: 'Ubuntu' }
    })
    expect(projectOverrideStore.getWorktreeCatalogBindingSourceSnapshot(expected)).toBeNull()

    const globalDefaultStore = createStore()
    registerExactWorktree(globalDefaultStore, repo(), expected)
    globalDefaultStore.updateSettings({
      localWindowsRuntimeDefault: { kind: 'wsl', distro: 'Ubuntu' }
    })
    expect(globalDefaultStore.getWorktreeCatalogBindingSourceSnapshot(expected)).toBeNull()

    const hostOverrideStore = createStore()
    registerExactWorktree(hostOverrideStore, repo(), expected)
    const hostProject = hostOverrideStore.getProjects()[0]
    expect(hostProject).toBeDefined()
    if (!hostProject) {
      return
    }
    hostOverrideStore.updateProject(hostProject.id, {
      localWindowsRuntimePreference: { kind: 'windows-host' }
    })
    hostOverrideStore.updateSettings({
      localWindowsRuntimeDefault: { kind: 'wsl', distro: 'Ubuntu' }
    })
    expect(hostOverrideStore.getWorktreeCatalogBindingSourceSnapshot(expected)).not.toBeNull()
  })
})
