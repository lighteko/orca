import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TicketWorkspaceFixturePresentation } from '../../shared/ticket-workspace-fixture-boundary'
import {
  reboundTicketWorkspaceFixtureResponse,
  TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL,
  TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL,
  type TicketWorkspaceFixtureSelection
} from '../../shared/ticket-workspace-owner-binding-boundary'
import {
  createLocalNativeWorktreeBindingHarness,
  makePositiveTicketWorkspaceSnapshot,
  validatedFullTicketSnapshot
} from '../runtime/__fixtures__/ticket-workspace-owner-fixtures'
import { RuntimeTicketWorkspaceOwnerBindingCommands } from '../runtime/runtime-ticket-workspace-owner-binding'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel)
    if (!handler) {
      throw new Error('missing_test_ipc_handler')
    }
    return handler(...args)
  })
  return { handlers, invoke }
})

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, ipcRenderer: { invoke: mocks.invoke } }))
vi.mock('../startup/main-process-state', () => ({ mainProcessState: { runtime: null } }))
vi.mock('../ticket-workspace/ticket-workspace-fixture-service', () => ({
  loadValidatedFixture: vi.fn()
}))

const { createTicketWorkspaceOwnerBindingIpcHandlers } =
  await import('./ticket-workspace-owner-binding-ipc')
const { ticketWorkspaceFixtureApi } =
  await import('../../preload/api/ticket-workspace-fixture-bridge')

describe('ticket workspace owner binding IPC and preload join', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.invoke.mockReset()
    mocks.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      const handler = mocks.handlers.get(channel)
      if (!handler) {
        throw new Error('missing_test_ipc_handler')
      }
      return handler(...args)
    })
  })

  it('matches and click-time rebinds one synthetic presentation revision end to end', async () => {
    const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot({
      referenceState: 'unavailable'
    })
    const presentation = syntheticPresentation(snapshot)
    const selection = selectionFromPresentation(presentation)
    expect(selection.snapshotRevision).toBe(snapshot.snapshotRevision)

    const harness = createLocalNativeWorktreeBindingHarness()
    const loadValidatedFixture = vi.fn(async (revision: string) =>
      revision === snapshot.snapshotRevision ? snapshot : null
    )
    const ownerCommands = new RuntimeTicketWorkspaceOwnerBindingCommands(
      harness.commands,
      loadValidatedFixture
    )
    const runtime = {
      matchTicketWorkspaceFixtureSelection: (
        current: typeof snapshot,
        request: TicketWorkspaceFixtureSelection
      ) => ownerCommands.resolveFixtureMatch(current, request),
      rebindTicketWorkspaceFixtureSelection: async (
        request: TicketWorkspaceFixtureSelection,
        loadFixture: typeof loadValidatedFixture
      ) => {
        const commands = new RuntimeTicketWorkspaceOwnerBindingCommands(
          harness.commands,
          loadFixture
        )
        return reboundTicketWorkspaceFixtureResponse(
          request,
          await commands.rebindFixtureSelection(request)
        )
      }
    }
    const handlers = createTicketWorkspaceOwnerBindingIpcHandlers({
      loadValidatedFixture,
      getRuntime: () => runtime
    })
    mocks.handlers.set(TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL, (...args) => handlers.match(...args))
    mocks.handlers.set(TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL, (...args) =>
      handlers.rebind(...args)
    )

    const match = await ticketWorkspaceFixtureApi.matchFixtureSelection(selection)
    expect(match).toEqual({ status: 'matched', ...selection })
    expect(match).not.toHaveProperty('worktreeId')

    const click = await ticketWorkspaceFixtureApi.rebindFixtureSelection(selection)
    expect(click).toEqual({
      status: 'rebound',
      ...selection,
      worktreeId: 'common-api::/repo/worktree'
    })
    expect(loadValidatedFixture).toHaveBeenNthCalledWith(1, snapshot.snapshotRevision)
    expect(loadValidatedFixture).toHaveBeenNthCalledWith(2, snapshot.snapshotRevision)
    expect(loadValidatedFixture).toHaveBeenNthCalledWith(3, snapshot.snapshotRevision)
    expect(harness.getListCallCount()).toBe(3)
    expect(selector).toEqual({
      ticketKey: selection.ticketKey,
      repositoryId: selection.repositoryId
    })
  })

  it('keeps the shipped full fixture as a negative owner match and click', async () => {
    const snapshot = validatedFullTicketSnapshot()
    const ticket = snapshot.tickets[0]
    const workspace = ticket?.workspaces.find((row) => row.repositoryId === 'common-api')
    if (!ticket || !workspace) {
      throw new Error('The delivered snapshot.full fixture changed shape.')
    }
    const selection = {
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: ticket.ticketKey,
      repositoryId: workspace.repositoryId
    }
    const harness = createLocalNativeWorktreeBindingHarness()
    const loadValidatedFixture = vi.fn(async (revision: string) =>
      revision === snapshot.snapshotRevision ? snapshot : null
    )
    const ownerCommands = new RuntimeTicketWorkspaceOwnerBindingCommands(
      harness.commands,
      loadValidatedFixture
    )
    const runtime = {
      matchTicketWorkspaceFixtureSelection: (
        current: typeof snapshot,
        request: TicketWorkspaceFixtureSelection
      ) => ownerCommands.resolveFixtureMatch(current, request),
      rebindTicketWorkspaceFixtureSelection: async (
        request: TicketWorkspaceFixtureSelection,
        loadFixture: typeof loadValidatedFixture
      ) => {
        const commands = new RuntimeTicketWorkspaceOwnerBindingCommands(
          harness.commands,
          loadFixture
        )
        return reboundTicketWorkspaceFixtureResponse(
          request,
          await commands.rebindFixtureSelection(request)
        )
      }
    }
    const handlers = createTicketWorkspaceOwnerBindingIpcHandlers({
      loadValidatedFixture,
      getRuntime: () => runtime
    })
    mocks.handlers.set(TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL, (...args) => handlers.match(...args))
    mocks.handlers.set(TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL, (...args) =>
      handlers.rebind(...args)
    )

    await expect(ticketWorkspaceFixtureApi.matchFixtureSelection(selection)).resolves.toEqual({
      status: 'unavailable',
      ...selection
    })
    await expect(ticketWorkspaceFixtureApi.rebindFixtureSelection(selection)).resolves.toEqual({
      status: 'unavailable',
      ...selection
    })
    expect(harness.getListCallCount()).toBe(0)
  })

  it('rejects extra renderer fields and reports runtime absence without exposing evidence', async () => {
    const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot()
    const loadValidatedFixture = vi.fn(async (revision: string) =>
      revision === snapshot.snapshotRevision ? snapshot : null
    )
    const handlers = createTicketWorkspaceOwnerBindingIpcHandlers({
      loadValidatedFixture,
      getRuntime: () => null
    })

    await expect(
      handlers.match({ ...selector, snapshotRevision: snapshot.snapshotRevision, path: '/repo' })
    ).resolves.toEqual({ status: 'unavailable' })
    await expect(
      handlers.match({ snapshotRevision: snapshot.snapshotRevision, ...selector })
    ).resolves.toEqual({
      status: 'unavailable',
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: selector.ticketKey,
      repositoryId: selector.repositoryId
    })
    await expect(
      handlers.rebind({
        snapshotRevision: snapshot.snapshotRevision,
        ticketKey: selector.ticketKey,
        repositoryId: selector.repositoryId
      })
    ).resolves.toEqual({
      status: 'unavailable',
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: selector.ticketKey,
      repositoryId: selector.repositoryId
    })
    expect(loadValidatedFixture).toHaveBeenCalledOnce()
  })

  it('normalizes an invalid click response in preload', async () => {
    const selection = {
      snapshotRevision: 'a'.repeat(64),
      ticketKey: 'ORCA-7',
      repositoryId: 'common-api'
    }
    mocks.invoke.mockResolvedValueOnce({
      status: 'matched',
      ...selection,
      path: '/repo/worktree'
    })
    await expect(ticketWorkspaceFixtureApi.matchFixtureSelection(selection)).resolves.toEqual({
      status: 'unavailable'
    })

    mocks.invoke.mockResolvedValueOnce({
      status: 'rebound',
      ...selection,
      worktreeId: 'other-repo::/repo/worktree',
      target: { path: '/repo/worktree' }
    })

    await expect(ticketWorkspaceFixtureApi.rebindFixtureSelection(selection)).resolves.toEqual({
      status: 'unavailable'
    })
  })

  it('correlates match and rebind responses with the exact preload request', async () => {
    const selection = {
      snapshotRevision: 'a'.repeat(64),
      ticketKey: 'ORCA-7',
      repositoryId: 'common-api'
    }
    const mismatches = [
      { snapshotRevision: 'b'.repeat(64) },
      { ticketKey: 'ORCA-8' },
      { repositoryId: 'other-repo' }
    ]

    for (const mismatch of mismatches) {
      mocks.invoke.mockResolvedValueOnce({ status: 'matched', ...selection, ...mismatch })
      await expect(ticketWorkspaceFixtureApi.matchFixtureSelection(selection)).resolves.toEqual({
        status: 'unavailable'
      })

      mocks.invoke.mockResolvedValueOnce({
        status: 'rebound',
        ...selection,
        ...mismatch,
        worktreeId: 'common-api::/repo/worktree'
      })
      await expect(ticketWorkspaceFixtureApi.rebindFixtureSelection(selection)).resolves.toEqual({
        status: 'unavailable'
      })
    }

    mocks.invoke.mockResolvedValueOnce({ status: 'unavailable', ...selection })
    await expect(ticketWorkspaceFixtureApi.matchFixtureSelection(selection)).resolves.toEqual({
      status: 'unavailable',
      ...selection
    })

    mocks.invoke.mockResolvedValueOnce({
      status: 'unavailable',
      ...selection,
      ticketKey: 'ORCA-8'
    })
    await expect(ticketWorkspaceFixtureApi.rebindFixtureSelection(selection)).resolves.toEqual({
      status: 'unavailable'
    })

    const invokeCallCount = mocks.invoke.mock.calls.length
    const invalidSelection = { ...selection, path: '/untrusted' }
    await expect(
      ticketWorkspaceFixtureApi.matchFixtureSelection(invalidSelection)
    ).resolves.toEqual({ status: 'unavailable' })
    expect(mocks.invoke).toHaveBeenCalledTimes(invokeCallCount)
  })
})

function syntheticPresentation(
  snapshot: ReturnType<typeof makePositiveTicketWorkspaceSnapshot>['snapshot']
): TicketWorkspaceFixturePresentation {
  const ticket = snapshot.tickets[0]
  const workspace = ticket?.workspaces.find((row) => row.repositoryId === 'common-api')
  if (!ticket || !workspace) {
    throw new Error('The positive snapshot fixture changed shape.')
  }
  return {
    status: 'fixture',
    provenance: {
      kind: 'fixture',
      snapshotCaseId: 'synthetic-positive-owner-match',
      snapshotRevision: snapshot.snapshotRevision
    },
    orcaMatch: { status: 'not-evaluated' },
    tickets: [
      {
        ticketKey: ticket.ticketKey,
        label: ticket.label,
        lifecycle: ticket.lifecycle,
        availability: ticket.availability,
        coordinatorTargetDeclared: ticket.coordinatorTarget !== undefined,
        workspaces: [
          {
            repositoryId: workspace.repositoryId,
            label: workspace.label,
            role: workspace.role,
            actualState: workspace.actualState
          }
        ]
      }
    ]
  }
}

function selectionFromPresentation(
  presentation: TicketWorkspaceFixturePresentation
): TicketWorkspaceFixtureSelection {
  if (presentation.status !== 'fixture') {
    throw new Error('The synthetic ticket presentation is unavailable.')
  }
  const ticket = presentation.tickets[0]
  const workspace = ticket?.workspaces[0]
  if (!ticket || !workspace) {
    throw new Error('The synthetic ticket presentation is missing its selector row.')
  }
  return {
    snapshotRevision: presentation.provenance.snapshotRevision,
    ticketKey: ticket.ticketKey,
    repositoryId: workspace.repositoryId
  }
}
