import { ipcMain } from 'electron'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  parseTicketWorkspaceFixtureSelection,
  unavailableTicketWorkspaceFixtureMatchResponse,
  unavailableTicketWorkspaceFixtureRebindResponse,
  validateTicketWorkspaceFixtureMatchResponse,
  validateTicketWorkspaceFixtureRebindResponse,
  TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL,
  TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL,
  type TicketWorkspaceFixtureMatchResponse,
  type TicketWorkspaceFixtureRebindResponse,
  type TicketWorkspaceFixtureSelection
} from '../../shared/ticket-workspace-owner-binding-boundary'
import { loadValidatedFixture } from '../ticket-workspace/ticket-workspace-fixture-service'
import { mainProcessState } from '../startup/main-process-state'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

type OwnerBindingRuntime = Pick<
  OrcaRuntimeService,
  'matchTicketWorkspaceFixtureSelection' | 'rebindTicketWorkspaceFixtureSelection'
>

export type TicketWorkspaceOwnerBindingIpcDependencies = {
  loadValidatedFixture: (revision: string) => Promise<TicketNavigatorSnapshotV1 | null>
  getRuntime: () => OwnerBindingRuntime | null
}

export type TicketWorkspaceOwnerBindingIpcHandlers = {
  match: (...args: unknown[]) => Promise<TicketWorkspaceFixtureMatchResponse>
  rebind: (...args: unknown[]) => Promise<TicketWorkspaceFixtureRebindResponse>
}

export function createTicketWorkspaceOwnerBindingIpcHandlers(
  dependencies: TicketWorkspaceOwnerBindingIpcDependencies
): TicketWorkspaceOwnerBindingIpcHandlers {
  return {
    match: async (...args) => {
      const selection = parseSingleSelectionArgument(args)
      if (!selection) {
        return unavailableTicketWorkspaceFixtureMatchResponse()
      }
      try {
        const snapshot = await dependencies.loadValidatedFixture(selection.snapshotRevision)
        if (!snapshot || snapshot.snapshotRevision !== selection.snapshotRevision) {
          return unavailableTicketWorkspaceFixtureMatchResponse(selection)
        }
        const runtime = dependencies.getRuntime()
        if (!runtime) {
          return unavailableTicketWorkspaceFixtureMatchResponse(selection)
        }
        const result = validateTicketWorkspaceFixtureMatchResponse(
          await runtime.matchTicketWorkspaceFixtureSelection(snapshot, selection)
        )
        return responseHasSelection(result, selection)
          ? result
          : unavailableTicketWorkspaceFixtureMatchResponse(selection)
      } catch {
        return unavailableTicketWorkspaceFixtureMatchResponse(selection)
      }
    },
    rebind: async (...args) => {
      const selection = parseSingleSelectionArgument(args)
      if (!selection) {
        return unavailableTicketWorkspaceFixtureRebindResponse()
      }
      try {
        const runtime = dependencies.getRuntime()
        if (!runtime) {
          return unavailableTicketWorkspaceFixtureRebindResponse(selection)
        }
        const result = validateTicketWorkspaceFixtureRebindResponse(
          await runtime.rebindTicketWorkspaceFixtureSelection(
            selection,
            dependencies.loadValidatedFixture
          )
        )
        return responseHasSelection(result, selection)
          ? result
          : unavailableTicketWorkspaceFixtureRebindResponse(selection)
      } catch {
        return unavailableTicketWorkspaceFixtureRebindResponse(selection)
      }
    }
  }
}

export function registerTicketWorkspaceOwnerBindingIpcHandlers(): void {
  const handlers = createTicketWorkspaceOwnerBindingIpcHandlers({
    loadValidatedFixture,
    getRuntime: () => mainProcessState.runtime
  })
  ipcMain.handle(TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL, (_event, ...args: unknown[]) =>
    handlers.match(...args)
  )
  ipcMain.handle(TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL, (_event, ...args: unknown[]) =>
    handlers.rebind(...args)
  )
}

function parseSingleSelectionArgument(
  args: readonly unknown[]
): TicketWorkspaceFixtureSelection | null {
  return args.length === 1 ? parseTicketWorkspaceFixtureSelection(args[0]) : null
}

function responseHasSelection(
  response: TicketWorkspaceFixtureMatchResponse | TicketWorkspaceFixtureRebindResponse,
  selection: TicketWorkspaceFixtureSelection
): boolean {
  return response.status === 'unavailable' && !('snapshotRevision' in response)
    ? false
    : 'snapshotRevision' in response &&
        response.snapshotRevision === selection.snapshotRevision &&
        response.ticketKey === selection.ticketKey &&
        response.repositoryId === selection.repositoryId
}
