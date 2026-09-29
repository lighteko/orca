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
import {
  TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL,
  TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL,
  parseTicketWorkspaceFixtureSelection,
  unavailableTicketWorkspaceFixtureMatchResponse,
  unavailableTicketWorkspaceFixtureRebindResponse,
  validateTicketWorkspaceFixtureMatchResponse,
  validateTicketWorkspaceFixtureRebindResponse,
  type TicketWorkspaceFixtureMatchResponse,
  type TicketWorkspaceFixtureRebindResponse,
  type TicketWorkspaceFixtureSelection
} from '../../shared/ticket-workspace-owner-binding-boundary'
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
  },
  matchFixtureSelection: async (selection) => {
    try {
      const request = parseTicketWorkspaceFixtureSelection(selection)
      if (!request) {
        return unavailableTicketWorkspaceFixtureMatchResponse()
      }
      const response = validateTicketWorkspaceFixtureMatchResponse(
        await ipcRenderer.invoke(TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL, request)
      )
      return isCorrelatedFixtureResponse(request, response)
        ? response
        : unavailableTicketWorkspaceFixtureMatchResponse()
    } catch {
      return unavailableTicketWorkspaceFixtureMatchResponse()
    }
  },
  rebindFixtureSelection: async (selection) => {
    try {
      const request = parseTicketWorkspaceFixtureSelection(selection)
      if (!request) {
        return unavailableTicketWorkspaceFixtureRebindResponse()
      }
      const response = validateTicketWorkspaceFixtureRebindResponse(
        await ipcRenderer.invoke(TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL, request)
      )
      return isCorrelatedFixtureResponse(request, response)
        ? response
        : unavailableTicketWorkspaceFixtureRebindResponse()
    } catch {
      return unavailableTicketWorkspaceFixtureRebindResponse()
    }
  }
} satisfies PreloadApi['ticketWorkspace']

function isCorrelatedFixtureResponse(
  request: TicketWorkspaceFixtureSelection,
  response: TicketWorkspaceFixtureMatchResponse | TicketWorkspaceFixtureRebindResponse
): boolean {
  if (!('snapshotRevision' in response)) {
    return true
  }
  return (
    response.snapshotRevision === request.snapshotRevision &&
    response.ticketKey === request.ticketKey &&
    response.repositoryId === request.repositoryId
  )
}
