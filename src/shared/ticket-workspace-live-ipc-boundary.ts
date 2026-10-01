import type {
  TicketWorkspaceLiveMatchResponse,
  TicketWorkspaceLivePresentationRequest,
  TicketWorkspaceLivePresentationResponse,
  TicketWorkspaceLiveRebindResponse,
  TicketWorkspaceLiveSelectionRequest
} from './ticket-workspace-live-boundary'

export const TICKET_WORKSPACE_LIVE_IPC_CHANNELS = {
  getPresentation: 'ticketWorkspaceLive:getPresentation',
  matchSelection: 'ticketWorkspaceLive:matchSelection',
  rebindSelectionAtClick: 'ticketWorkspaceLive:rebindSelectionAtClick'
} as const

export type TicketWorkspaceLiveIpcContract = {
  [TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation]: {
    request: TicketWorkspaceLivePresentationRequest
    response: TicketWorkspaceLivePresentationResponse
  }
  [TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection]: {
    request: TicketWorkspaceLiveSelectionRequest
    response: TicketWorkspaceLiveMatchResponse
  }
  [TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick]: {
    request: TicketWorkspaceLiveSelectionRequest
    response: TicketWorkspaceLiveRebindResponse
  }
}

export function unavailableTicketWorkspaceLivePresentationResponse(
  request: TicketWorkspaceLivePresentationRequest
): TicketWorkspaceLivePresentationResponse {
  return { status: 'unavailable', requestId: request.requestId }
}

export function unavailableTicketWorkspaceLiveMatchResponse(
  request: TicketWorkspaceLiveSelectionRequest
): TicketWorkspaceLiveMatchResponse {
  return { ...copySelection(request), status: 'unavailable' }
}

export function unavailableTicketWorkspaceLiveRebindResponse(
  request: TicketWorkspaceLiveSelectionRequest
): TicketWorkspaceLiveRebindResponse {
  return { ...copySelection(request), status: 'unavailable' }
}

function copySelection(request: TicketWorkspaceLiveSelectionRequest) {
  return {
    requestId: request.requestId,
    receiptId: request.receiptId,
    snapshotRevision: request.snapshotRevision,
    sourceIdentity: { ...request.sourceIdentity },
    ticketKey: request.ticketKey,
    repositoryId: request.repositoryId
  }
}
