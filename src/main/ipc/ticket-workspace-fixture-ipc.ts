import { ipcMain } from 'electron'
import {
  TICKET_WORKSPACE_FIXTURE_CHANNEL,
  unavailableTicketWorkspaceFixtureWireResponse
} from '../../shared/ticket-workspace-fixture-boundary'
import { getTicketWorkspaceFixtureWireResponse } from '../ticket-workspace/ticket-workspace-fixture-service'

export function registerTicketWorkspaceFixtureIpcHandler(): void {
  ipcMain.handle(TICKET_WORKSPACE_FIXTURE_CHANNEL, (_event, ...args: unknown[]) => {
    if (args.length !== 0) {
      return unavailableTicketWorkspaceFixtureWireResponse()
    }
    return getTicketWorkspaceFixtureWireResponse()
  })
}
