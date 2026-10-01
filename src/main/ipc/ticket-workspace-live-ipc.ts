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
import type { DesktopRuntimeSenderLifecycle } from './desktop-runtime-sender-lifecycle'
import { abortWhenRendererGone } from './renderer-lifetime-abort'
import { isTrustedUIRenderer } from './ui'

export type TicketWorkspaceLiveRequestContext = Readonly<{
  signal: AbortSignal
  isCurrentDocument(): boolean
  setFinalPublicationGuard(guard: () => boolean): void
}>

export type TicketWorkspaceLiveApiForTrustedSender = (
  sender: WebContents,
  context: TicketWorkspaceLiveRequestContext
) => TicketWorkspaceLiveApi | null

type SenderLifecycle = Pick<
  DesktopRuntimeSenderLifecycle,
  'connectionIdFor' | 'captureCurrentDocument'
>
type GetSenderLifecycle = () => SenderLifecycle | null
type TicketWorkspaceLiveResponse =
  | TicketWorkspaceLivePresentationResponse
  | TicketWorkspaceLiveMatchResponse
  | TicketWorkspaceLiveRebindResponse

type TicketWorkspaceLiveHandler<Response extends TicketWorkspaceLiveResponse> = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => Promise<Response>

export function registerTicketWorkspaceLiveIpcHandlers(
  getApiForTrustedSender: TicketWorkspaceLiveApiForTrustedSender = () => null,
  getSenderLifecycle: GetSenderLifecycle = () => null
): void {
  ipcMain.handle(
    TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation,
    createHandler<TicketWorkspaceLivePresentationRequest, TicketWorkspaceLivePresentationResponse>(
      parseTicketWorkspaceLivePresentationRequest,
      unavailableTicketWorkspaceLivePresentationResponse,
      (api, request) => api.getPresentation(request),
      validateTicketWorkspaceLivePresentationResponse,
      getApiForTrustedSender,
      getSenderLifecycle
    )
  )
  ipcMain.handle(
    TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection,
    createHandler<TicketWorkspaceLiveSelectionRequest, TicketWorkspaceLiveMatchResponse>(
      parseTicketWorkspaceLiveSelectionRequest,
      unavailableTicketWorkspaceLiveMatchResponse,
      (api, request) => api.matchSelection(request),
      validateTicketWorkspaceLiveMatchResponse,
      getApiForTrustedSender,
      getSenderLifecycle
    )
  )
  ipcMain.handle(
    TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick,
    createHandler<TicketWorkspaceLiveSelectionRequest, TicketWorkspaceLiveRebindResponse>(
      parseTicketWorkspaceLiveSelectionRequest,
      unavailableTicketWorkspaceLiveRebindResponse,
      (api, request) => api.rebindSelectionAtClick(request),
      validateTicketWorkspaceLiveRebindResponse,
      getApiForTrustedSender,
      getSenderLifecycle
    )
  )
}

function createHandler<Request, Response extends TicketWorkspaceLiveResponse>(
  parseRequest: (value: unknown) => Request | null,
  unavailable: (request: Request) => Response,
  invoke: (api: TicketWorkspaceLiveApi, request: Request) => Promise<unknown>,
  validate: (value: unknown, request: Request) => Response | null,
  getApiForTrustedSender: TicketWorkspaceLiveApiForTrustedSender,
  getSenderLifecycle: GetSenderLifecycle
): TicketWorkspaceLiveHandler<Response> {
  return async (event, ...args) => {
    const request = args.length === 1 ? parseRequest(args[0]) : null
    if (!request) {
      throw new Error('Invalid ticket workspace live request')
    }

    const invokingFrame = event.senderFrame
    const caller = abortWhenRendererGone(event.sender)
    let guardRegistrationOpen = true
    let guardRegistrationInvalid = false
    let handlerCompleted = false
    const finalPublicationGuard: { current: (() => boolean) | null } = { current: null }
    try {
      if (!isCurrentTrustedMainFrame(event, invokingFrame, caller.signal)) {
        return unavailable(request)
      }

      const senderLifecycle = getSenderLifecycle()
      if (!senderLifecycle || !isCurrentTrustedMainFrame(event, invokingFrame, caller.signal)) {
        return unavailable(request)
      }

      senderLifecycle.connectionIdFor(event.sender)
      const capturedDocument = senderLifecycle.captureCurrentDocument(event.sender)
      if (!capturedDocument) {
        return unavailable(request)
      }
      const isCurrentDocument = (): boolean => {
        try {
          return (
            !caller.signal.aborted &&
            capturedDocument.isCurrent() &&
            isCurrentTrustedMainFrame(event, invokingFrame, caller.signal)
          )
        } catch {
          return false
        }
      }
      const context: TicketWorkspaceLiveRequestContext = Object.freeze({
        signal: caller.signal,
        isCurrentDocument,
        setFinalPublicationGuard: (guard: () => boolean): void => {
          if (handlerCompleted) {
            return
          }
          if (
            !guardRegistrationOpen ||
            finalPublicationGuard.current !== null ||
            typeof guard !== 'function'
          ) {
            guardRegistrationInvalid = true
            return
          }
          finalPublicationGuard.current = guard
        }
      })

      if (!context.isCurrentDocument()) {
        return unavailable(request)
      }
      const api = getApiForTrustedSender(event.sender, context)
      if (!api || !context.isCurrentDocument()) {
        return unavailable(request)
      }

      let rawResponse: unknown
      try {
        rawResponse = await invoke(api, request)
      } finally {
        guardRegistrationOpen = false
      }
      const response = validate(rawResponse, request)
      if (!response) {
        return unavailable(request)
      }
      const requiresPublicationGuard = requiresFinalPublicationGuard(response)
      if (requiresPublicationGuard) {
        const guard = finalPublicationGuard.current
        if (!guard) {
          return unavailable(request)
        }
        let guardResult: unknown
        try {
          guardResult = guard()
        } catch {
          return unavailable(request)
        }
        if (guardResult !== true) {
          return unavailable(request)
        }
      }
      const callerIsCurrent =
        context.isCurrentDocument() &&
        isCurrentTrustedMainFrame(event, invokingFrame, caller.signal)
      if (!callerIsCurrent || (requiresPublicationGuard && guardRegistrationInvalid)) {
        return unavailable(request)
      }
      return response
    } catch {
      return unavailable(request)
    } finally {
      guardRegistrationOpen = false
      handlerCompleted = true
      caller.dispose()
    }
  }
}

function requiresFinalPublicationGuard(
  response:
    | TicketWorkspaceLivePresentationResponse
    | TicketWorkspaceLiveMatchResponse
    | TicketWorkspaceLiveRebindResponse
): boolean {
  return (
    response.status === 'current' || response.status === 'matched' || response.status === 'rebound'
  )
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
