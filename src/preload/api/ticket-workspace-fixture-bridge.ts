import { ipcRenderer } from 'electron'
import {
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  projectTicketWorkspaceFixtureResponse,
  TICKET_WORKSPACE_FIXTURE_CHANNEL,
  unavailableTicketWorkspaceFixturePresentation
} from '../../shared/ticket-workspace-fixture-boundary'
import type { PreloadApi } from '../api-types'

const fixtureContract = {
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  maxUtf8Bytes: TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1
}

export const ticketWorkspaceFixtureApi = {
  getSnapshot: async () => {
    try {
      return projectTicketWorkspaceFixtureResponse(
        await ipcRenderer.invoke(TICKET_WORKSPACE_FIXTURE_CHANNEL),
        fixtureContract
      )
    } catch {
      return unavailableTicketWorkspaceFixturePresentation()
    }
  }
} satisfies PreloadApi['ticketWorkspace']
