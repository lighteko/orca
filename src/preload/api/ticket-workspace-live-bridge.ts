import { ipcRenderer } from 'electron'
import {
  parseTicketWorkspaceLivePresentationRequest,
  parseTicketWorkspaceLiveSelectionRequest,
  validateTicketWorkspaceLiveMatchResponse,
  validateTicketWorkspaceLivePresentationResponse,
  validateTicketWorkspaceLiveRebindResponse,
  type TicketWorkspaceLivePresentationRequest,
  type TicketWorkspaceLiveSelectionRequest
} from '../../shared/ticket-workspace-live-boundary'
import {
  TICKET_WORKSPACE_LIVE_IPC_CHANNELS,
  unavailableTicketWorkspaceLiveMatchResponse,
  unavailableTicketWorkspaceLivePresentationResponse,
  unavailableTicketWorkspaceLiveRebindResponse
} from '../../shared/ticket-workspace-live-ipc-boundary'
import type { PreloadApi } from '../api-types'

const INVALID_REQUEST_MESSAGE = 'Invalid ticket workspace live request'

export const ticketWorkspaceLiveApi = {
  getPresentation: async (...args: [request: TicketWorkspaceLivePresentationRequest]) => {
    const request = parseExactlyOne(args, parseTicketWorkspaceLivePresentationRequest)
    return await invokeValidated(
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation,
      request,
      validateTicketWorkspaceLivePresentationResponse,
      unavailableTicketWorkspaceLivePresentationResponse
    )
  },
  matchSelection: async (...args: [request: TicketWorkspaceLiveSelectionRequest]) => {
    const request = parseExactlyOne(args, parseTicketWorkspaceLiveSelectionRequest)
    return await invokeValidated(
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection,
      request,
      validateTicketWorkspaceLiveMatchResponse,
      unavailableTicketWorkspaceLiveMatchResponse
    )
  },
  rebindSelectionAtClick: async (...args: [request: TicketWorkspaceLiveSelectionRequest]) => {
    const request = parseExactlyOne(args, parseTicketWorkspaceLiveSelectionRequest)
    return await invokeValidated(
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick,
      request,
      validateTicketWorkspaceLiveRebindResponse,
      unavailableTicketWorkspaceLiveRebindResponse
    )
  }
} satisfies PreloadApi['ticketWorkspaceLive']

function parseExactlyOne<Request>(
  args: readonly unknown[],
  parseRequest: (value: unknown) => Request | null
): Request {
  if (args.length !== 1) {
    throw new Error(INVALID_REQUEST_MESSAGE)
  }
  const request = parseRequest(args[0])
  if (!request) {
    throw new Error(INVALID_REQUEST_MESSAGE)
  }
  return request
}

async function invokeValidated<Request, Response>(
  channel: string,
  request: Request,
  validate: (value: unknown, request: Request) => Response | null,
  unavailable: (request: Request) => Response
): Promise<Response> {
  try {
    return validate(await ipcRenderer.invoke(channel, request), request) ?? unavailable(request)
  } catch {
    return unavailable(request)
  }
}
