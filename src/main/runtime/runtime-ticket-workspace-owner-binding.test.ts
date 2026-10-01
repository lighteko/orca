import { describe, expect, it, vi } from 'vitest'
import {
  createLocalNativeWorktreeBindingHarness,
  createWorktreeCatalogSourceSnapshot,
  makePositiveTicketWorkspaceSnapshot,
  OWNER_TEST_WORKTREE_ID
} from './__fixtures__/ticket-workspace-owner-fixtures'
import { RuntimeTicketWorkspaceOwnerBindingCommands } from './runtime-ticket-workspace-owner-binding'

describe('RuntimeTicketWorkspaceOwnerBindingCommands', () => {
  it('returns a separate Orca match without exposing its binding', async () => {
    const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot({
      referenceState: 'unavailable'
    })
    const harness = createLocalNativeWorktreeBindingHarness()
    const loadFixture = vi.fn(async (revision: string) =>
      revision === snapshot.snapshotRevision ? snapshot : null
    )
    const commands = new RuntimeTicketWorkspaceOwnerBindingCommands(harness.commands, loadFixture)

    const result = await commands.resolveFixtureMatch(snapshot, selector)

    expect(result).toEqual({
      status: 'matched',
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: selector.ticketKey,
      repositoryId: selector.repositoryId
    })
    expect(Object.keys(result).sort()).toEqual([
      'repositoryId',
      'snapshotRevision',
      'status',
      'ticketKey'
    ])
    expect(harness.getListCallCount()).toBe(1)
  })

  it('reloads by the three selectors and binds afresh for every activation click', async () => {
    const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot()
    const harness = createLocalNativeWorktreeBindingHarness()
    const loadFixture = vi.fn(async (revision: string) =>
      revision === snapshot.snapshotRevision ? snapshot : null
    )
    const commands = new RuntimeTicketWorkspaceOwnerBindingCommands(harness.commands, loadFixture)
    const request = {
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: selector.ticketKey,
      repositoryId: selector.repositoryId
    }

    await expect(commands.rebindFixtureSelection(request)).resolves.toBe(OWNER_TEST_WORKTREE_ID)
    harness.setSourceSnapshot(createWorktreeCatalogSourceSnapshot({ revision: 4 }))
    await expect(commands.rebindFixtureSelection(request)).resolves.toBe(OWNER_TEST_WORKTREE_ID)

    expect(Object.keys(request).sort()).toEqual(['repositoryId', 'snapshotRevision', 'ticketKey'])
    expect(loadFixture).toHaveBeenNthCalledWith(1, snapshot.snapshotRevision)
    expect(loadFixture).toHaveBeenNthCalledWith(2, snapshot.snapshotRevision)
    expect(harness.getListCallCount()).toBe(4)
  })

  it('rejects extra renderer fields and a fixture whose current revision changed', async () => {
    const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot()
    const changed = makePositiveTicketWorkspaceSnapshot({ worktreePath: '/repo/rebound' }).snapshot
    const harness = createLocalNativeWorktreeBindingHarness()
    const loadFixture = vi.fn(async () => changed)
    const commands = new RuntimeTicketWorkspaceOwnerBindingCommands(harness.commands, loadFixture)
    const request = {
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: selector.ticketKey,
      repositoryId: selector.repositoryId
    }

    await expect(
      commands.rebindFixtureSelection({ ...request, worktreeId: OWNER_TEST_WORKTREE_ID })
    ).resolves.toBeNull()
    expect(loadFixture).not.toHaveBeenCalled()

    await expect(commands.rebindFixtureSelection(request)).resolves.toBeNull()
    expect(loadFixture).toHaveBeenCalledWith(snapshot.snapshotRevision)
    expect(harness.getListCallCount()).toBe(0)
  })

  it('rechecks the active fixture after a deferred bind before returning an ID', async () => {
    for (const change of ['disabled', 'revision-changed'] as const) {
      const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot()
      const changed = makePositiveTicketWorkspaceSnapshot({
        worktreePath: '/repo/changed-during-bind'
      }).snapshot
      const harness = createLocalNativeWorktreeBindingHarness()
      let activeSnapshot: typeof snapshot | null = snapshot
      let continueBinding = (): void => {}
      let signalBindingStarted = (): void => {}
      const bindingGate = new Promise<void>((resolve) => {
        continueBinding = resolve
      })
      const bindingStarted = new Promise<void>((resolve) => {
        signalBindingStarted = resolve
      })
      const loadFixture = vi.fn(async (revision: string) =>
        activeSnapshot?.snapshotRevision === revision ? activeSnapshot : null
      )
      const commands = new RuntimeTicketWorkspaceOwnerBindingCommands(
        {
          resolveExactLocalNativeGitTarget: async (request, signal) => {
            const binding = await harness.commands.resolveExactLocalNativeGitTarget(request, signal)
            signalBindingStarted()
            await bindingGate
            return binding
          },
          isExactLocalNativeGitBindingCurrent: (binding, signal) =>
            harness.commands.isExactLocalNativeGitBindingCurrent(binding, signal)
        },
        loadFixture
      )
      const result = commands.rebindFixtureSelection({
        snapshotRevision: snapshot.snapshotRevision,
        ticketKey: selector.ticketKey,
        repositoryId: selector.repositoryId
      })

      await bindingStarted
      activeSnapshot = change === 'disabled' ? null : changed
      continueBinding()

      await expect(result).resolves.toBeNull()
      expect(loadFixture).toHaveBeenCalledTimes(2)
      expect(harness.getListCallCount()).toBe(2)
    }
  })

  it('reloads the fixture after deferred owner currentness and before returning an ID', async () => {
    const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot()
    const harness = createLocalNativeWorktreeBindingHarness()
    let activeSnapshot: typeof snapshot | null = snapshot
    let continueCurrentness = (): void => {}
    let signalCurrentnessStarted = (): void => {}
    const currentnessGate = new Promise<void>((resolve) => {
      continueCurrentness = resolve
    })
    const currentnessStarted = new Promise<void>((resolve) => {
      signalCurrentnessStarted = resolve
    })
    const loadFixture = vi.fn(async (revision: string) =>
      activeSnapshot?.snapshotRevision === revision ? activeSnapshot : null
    )
    const commands = new RuntimeTicketWorkspaceOwnerBindingCommands(
      {
        resolveExactLocalNativeGitTarget: (request, signal) =>
          harness.commands.resolveExactLocalNativeGitTarget(request, signal),
        isExactLocalNativeGitBindingCurrent: async (binding, signal) => {
          const isCurrent = await harness.commands.isExactLocalNativeGitBindingCurrent(
            binding,
            signal
          )
          signalCurrentnessStarted()
          await currentnessGate
          return isCurrent
        }
      },
      loadFixture
    )
    const result = commands.rebindFixtureSelection({
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: selector.ticketKey,
      repositoryId: selector.repositoryId
    })

    await currentnessStarted
    activeSnapshot = null
    continueCurrentness()

    await expect(result).resolves.toBeNull()
    expect(loadFixture).toHaveBeenCalledTimes(2)
    expect(harness.getListCallCount()).toBe(2)
  })

  it('does not reuse a previous match after a route or catalog revision changes during rebind', async () => {
    const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot()
    const harness = createLocalNativeWorktreeBindingHarness()
    const commands = new RuntimeTicketWorkspaceOwnerBindingCommands(
      harness.commands,
      async () => snapshot
    )
    const request = {
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: selector.ticketKey,
      repositoryId: selector.repositoryId
    }

    await expect(commands.resolveFixtureMatch(snapshot, selector)).resolves.toMatchObject({
      status: 'matched'
    })
    for (const repo of [
      { path: '\\\\wsl.localhost\\Ubuntu\\repo' },
      { connectionId: 'paired-host-1' }
    ]) {
      harness.setSourceSnapshot(createWorktreeCatalogSourceSnapshot({ repo }))
      await expect(commands.rebindFixtureSelection(request)).resolves.toBeNull()
    }

    harness.setSourceSnapshot(createWorktreeCatalogSourceSnapshot({ revision: 8 }))
    harness.setBeforeList(() => {
      harness.setSourceSnapshot(createWorktreeCatalogSourceSnapshot({ revision: 9 }))
      harness.setBeforeList(null)
    })
    await expect(commands.rebindFixtureSelection(request)).resolves.toBeNull()
    expect(harness.getListCallCount()).toBe(2)
  })

  it('rejects changed target host, instance, and registered worktree path', async () => {
    for (const options of [
      { executionHostId: 'ssh:builder' },
      { instanceId: 'instance-2' },
      { worktreePath: '/repo/rebound' }
    ]) {
      const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot(options)
      const harness = createLocalNativeWorktreeBindingHarness()
      const commands = new RuntimeTicketWorkspaceOwnerBindingCommands(
        harness.commands,
        async () => snapshot
      )

      await expect(
        commands.rebindFixtureSelection({
          snapshotRevision: snapshot.snapshotRevision,
          ticketKey: selector.ticketKey,
          repositoryId: selector.repositoryId
        })
      ).resolves.toBeNull()
      expect(harness.getListCallCount()).toBe(options.executionHostId ? 0 : 1)
    }
  })
})
