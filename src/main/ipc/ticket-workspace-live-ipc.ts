import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  parseTicketWorkspaceLivePresentationRequest,
  parseTicketWorkspaceLiveSelectionRequest,
  validateTicketWorkspaceLiveMatchResponse,
  validateTicketWorkspaceLivePresentationResponse,
  validateTicketWorkspaceLiveRebindResponse,
  type TicketWorkspaceLiveApi,
  type TicketWorkspaceLiveMatchResponse,
  type TicketWorkspaceLivePresentationRequest,
  type TicketWorkspaceLivePresentationResponse,
  type TicketWorkspaceLiveRebindResponse,
  type TicketWorkspaceLiveSelectionRequest
} from '../../shared/ticket-workspace-live-boundary'
import {
  TICKET_WORKSPACE_LIVE_IPC_CHANNELS,
  unavailableTicketWorkspaceLiveMatchResponse,
  unavailableTicketWorkspaceLivePresentationResponse,
  unavailableTicketWorkspaceLiveRebindResponse
} from '../../shared/ticket-workspace-live-ipc-boundary'
import { abortWhenRendererGone } from './renderer-lifetime-abort'
import { isTrustedUIRenderer } from './ui'

export type TicketWorkspaceLiveApiForTrustedSender = (
  sender: WebContents
) => TicketWorkspaceLiveApi | null

type TicketWorkspaceLiveHandler<Response> = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => Promise<Response>

export function registerTicketWorkspaceLiveIpcHandlers(
  getApiForTrustedSender: TicketWorkspaceLiveApiForTrustedSender = () => null
): void {
  ipcMain.handle(
    TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation,
    createHandler<TicketWorkspaceLivePresentationRequest, TicketWorkspaceLivePresentationResponse>(
      parseTicketWorkspaceLivePresentationRequest,
      unavailableTicketWorkspaceLivePresentationResponse,
      (api, request) => api.getPresentation(request),
      validateTicketWorkspaceLivePresentationResponse,
      getApiForTrustedSender
    )
  )
  ipcMain.handle(
    TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection,
    createHandler<TicketWorkspaceLiveSelectionRequest, TicketWorkspaceLiveMatchResponse>(
      parseTicketWorkspaceLiveSelectionRequest,
      unavailableTicketWorkspaceLiveMatchResponse,
      (api, request) => api.matchSelection(request),
      validateTicketWorkspaceLiveMatchResponse,
      getApiForTrustedSender
    )
  )
  ipcMain.handle(
    TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick,
    createHandler<TicketWorkspaceLiveSelectionRequest, TicketWorkspaceLiveRebindResponse>(
      parseTicketWorkspaceLiveSelectionRequest,
      unavailableTicketWorkspaceLiveRebindResponse,
      (api, request) => api.rebindSelectionAtClick(request),
      validateTicketWorkspaceLiveRebindResponse,
      getApiForTrustedSender
    )
  )
}

function createHandler<Request, Response>(
  parseRequest: (value: unknown) => Request | null,
  unavailable: (request: Request) => Response,
  invoke: (api: TicketWorkspaceLiveApi, request: Request) => Promise<unknown>,
  validate: (value: unknown, request: Request) => Response | null,
  getApiForTrustedSender: TicketWorkspaceLiveApiForTrustedSender
): TicketWorkspaceLiveHandler<Response> {
  return async (event, ...args) => {
    const request = args.length === 1 ? parseRequest(args[0]) : null
    if (!request) {
      throw new Error('Invalid ticket workspace live request')
    }

    const invokingFrame = event.senderFrame
    const caller = abortWhenRendererGone(event.sender)
    try {
      if (!isCurrentTrustedMainFrame(event, invokingFrame, caller.signal)) {
        return unavailable(request)
      }
      const api = getApiForTrustedSender(event.sender)
      if (!api || caller.signal.aborted) {
        return unavailable(request)
      }
      const response = validate(await invoke(api, request), request)
      return response && isCurrentTrustedMainFrame(event, invokingFrame, caller.signal)
        ? response
        : unavailable(request)
    } catch {
      return unavailable(request)
    } finally {
      caller.dispose()
    }
  }
}

function isCurrentTrustedMainFrame(
  event: IpcMainInvokeEvent,
  invokingFrame: IpcMainInvokeEvent['senderFrame'],
  signal: AbortSignal
): boolean {
  return (
    !signal.aborted &&
    invokingFrame !== null &&
    invokingFrame === event.sender.mainFrame &&
    isTrustedUIRenderer(event.sender)
  )
}
