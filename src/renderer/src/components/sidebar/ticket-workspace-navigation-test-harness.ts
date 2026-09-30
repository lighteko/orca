import type { TicketWorkspaceFixturePresentation } from '../../../../shared/ticket-workspace-fixture-boundary'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  reboundTicketWorkspaceFixtureResponse,
  TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL,
  TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL
} from '../../../../shared/ticket-workspace-owner-binding-boundary'
import type {
  TicketWorkspaceFixtureMatchResponse,
  TicketWorkspaceFixtureRebindResponse,
  TicketWorkspaceFixtureSelection
} from '../../../../shared/ticket-workspace-owner-binding-boundary'

type TicketSnapshot = TicketNavigatorSnapshotV1
type OwnerBindingTestHandlers = Map<string, (...args: unknown[]) => unknown>
type FixtureTestApi = {
  createLocalNativeWorktreeBindingHarness: () => {
    commands: unknown
    getListCallCount: () => number
  }
  makePositiveTicketWorkspaceSnapshot: (options?: {
    referenceState?: 'matched' | 'unavailable' | 'unsupported'
    executionHostId?: string
    instanceId?: string
    worktreePath?: string
  }) => { snapshot: TicketSnapshot; selector: { ticketKey: string; repositoryId: string } }
  validatedFullTicketSnapshot: () => TicketSnapshot
  OWNER_TEST_WORKTREE_ID: string
}
type RuntimeOwnerBindingCommands = {
  resolveFixtureMatch: (
    snapshot: TicketSnapshot,
    selection: TicketWorkspaceFixtureSelection
  ) => Promise<TicketWorkspaceFixtureMatchResponse>
  rebindFixtureSelection: (selection: TicketWorkspaceFixtureSelection) => Promise<string | null>
}
type RuntimeOwnerBindingModule = {
  RuntimeTicketWorkspaceOwnerBindingCommands: new (
    worktreeBindings: unknown,
    loadFixture: (revision: string) => Promise<TicketSnapshot | null>
  ) => RuntimeOwnerBindingCommands
}
type IpcHandlerModule = {
  createTicketWorkspaceOwnerBindingIpcHandlers: (dependencies: {
    loadValidatedFixture: (revision: string) => Promise<TicketSnapshot | null>
    getRuntime: () => {
      matchTicketWorkspaceFixtureSelection: (
        snapshot: TicketSnapshot,
        selection: TicketWorkspaceFixtureSelection
      ) => Promise<TicketWorkspaceFixtureMatchResponse>
      rebindTicketWorkspaceFixtureSelection: (
        selection: TicketWorkspaceFixtureSelection,
        loadFixture: (revision: string) => Promise<TicketSnapshot | null>
      ) => Promise<TicketWorkspaceFixtureRebindResponse>
    } | null
  }) => {
    match: (...args: unknown[]) => Promise<TicketWorkspaceFixtureMatchResponse>
    rebind: (...args: unknown[]) => Promise<TicketWorkspaceFixtureRebindResponse>
  }
}

const fixtureApiLoaders = import.meta.glob<FixtureTestApi>(
  '../../../../main/runtime/__fixtures__/ticket-workspace-owner-fixtures.ts'
)
const runtimeBindingLoaders = import.meta.glob<RuntimeOwnerBindingModule>(
  '../../../../main/runtime/runtime-ticket-workspace-owner-binding.ts'
)
const ipcHandlerLoaders = import.meta.glob<IpcHandlerModule>(
  '../../../../main/ipc/ticket-workspace-owner-binding-ipc.ts'
)
const preloadApiLoaders = import.meta.glob<{
  ticketWorkspaceFixtureApi: {
    matchFixtureSelection: (
      selection: TicketWorkspaceFixtureSelection
    ) => Promise<TicketWorkspaceFixtureMatchResponse>
    rebindFixtureSelection: (
      selection: TicketWorkspaceFixtureSelection
    ) => Promise<TicketWorkspaceFixtureRebindResponse>
  }
}>('../../../../preload/api/ticket-workspace-fixture-bridge.ts')

export async function loadTicketWorkspaceFixtureTestApi(): Promise<FixtureTestApi> {
  return loadModule(
    fixtureApiLoaders,
    '../../../../main/runtime/__fixtures__/ticket-workspace-owner-fixtures.ts'
  )
}

export async function installOwnerBindingTestAccessor(
  activeSnapshot: TicketSnapshot,
  handlersByChannel: OwnerBindingTestHandlers,
  fixtureApi: FixtureTestApi
): Promise<{ getListCallCount: () => number }> {
  const harness = fixtureApi.createLocalNativeWorktreeBindingHarness()
  const loadValidatedFixture = async (revision: string) =>
    revision === activeSnapshot.snapshotRevision ? activeSnapshot : null
  const [runtimeModule, ipcModule] = await Promise.all([
    loadModule(
      runtimeBindingLoaders,
      '../../../../main/runtime/runtime-ticket-workspace-owner-binding.ts'
    ),
    loadModule(ipcHandlerLoaders, '../../../../main/ipc/ticket-workspace-owner-binding-ipc.ts')
  ])
  const ownerCommands = new runtimeModule.RuntimeTicketWorkspaceOwnerBindingCommands(
    harness.commands,
    loadValidatedFixture
  )
  const handlers = ipcModule.createTicketWorkspaceOwnerBindingIpcHandlers({
    loadValidatedFixture,
    getRuntime: () => ({
      matchTicketWorkspaceFixtureSelection: (snapshot, selection) =>
        ownerCommands.resolveFixtureMatch(snapshot, selection),
      rebindTicketWorkspaceFixtureSelection: async (selection, loadFixture) => {
        const commands = new runtimeModule.RuntimeTicketWorkspaceOwnerBindingCommands(
          harness.commands,
          loadFixture
        )
        return reboundTicketWorkspaceFixtureResponse(
          selection,
          await commands.rebindFixtureSelection(selection)
        )
      }
    })
  })
  handlersByChannel.set(TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL, (...args) =>
    handlers.match(...args)
  )
  handlersByChannel.set(TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL, (...args) =>
    handlers.rebind(...args)
  )
  return harness
}

export async function installTicketWorkspacePresentation(
  presentation: TicketWorkspaceFixturePresentation
): Promise<void> {
  const apiModule = await loadModule(
    preloadApiLoaders,
    '../../../../preload/api/ticket-workspace-fixture-bridge.ts'
  )
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ticketWorkspace: {
        ...apiModule.ticketWorkspaceFixtureApi,
        getSnapshot: async () => presentation
      }
    }
  })
}

async function loadModule<T>(loaders: Record<string, () => Promise<T>>, path: string): Promise<T> {
  const load = loaders[path]
  if (!load) {
    throw new Error(`Missing test module loader: ${path}`)
  }
  return load()
}

export function syntheticTicketWorkspacePresentation(
  snapshot: TicketSnapshot,
  snapshotCaseId: string
): TicketWorkspaceFixturePresentation {
  const ticket = snapshot.tickets[0]
  const workspace = ticket?.workspaces.find((row) => row.repositoryId === 'common-api')
  if (!ticket || !workspace) {
    throw new Error('The fixture snapshot has no expected common-api row.')
  }
  return {
    status: 'fixture',
    provenance: { kind: 'fixture', snapshotCaseId, snapshotRevision: snapshot.snapshotRevision },
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

export function selectionForFixturePresentation(
  presentation: TicketWorkspaceFixturePresentation
): TicketWorkspaceFixtureSelection {
  if (presentation.status !== 'fixture') {
    throw new Error('Expected a fixture presentation.')
  }
  const ticket = presentation.tickets[0]
  const workspace = ticket?.workspaces[0]
  if (!ticket || !workspace) {
    throw new Error('Expected a ticket workspace selector.')
  }
  return {
    snapshotRevision: presentation.provenance.snapshotRevision,
    ticketKey: ticket.ticketKey,
    repositoryId: workspace.repositoryId
  }
}
