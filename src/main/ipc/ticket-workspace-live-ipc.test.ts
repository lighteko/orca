import { EventEmitter } from 'node:events'
import type { IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseTicketWorkspaceLivePresentationRequest,
  parseTicketWorkspaceLiveSelectionRequest,
  type TicketWorkspaceLiveApi,
  type TicketWorkspaceLiveMatchResponse,
  type TicketWorkspaceLivePresentationRequest,
  type TicketWorkspaceLiveSelectionRequest
} from '../../shared/ticket-workspace-live-boundary'
import {
  TICKET_WORKSPACE_LIVE_IPC_CHANNELS,
  unavailableTicketWorkspaceLiveMatchResponse,
  unavailableTicketWorkspaceLivePresentationResponse,
  unavailableTicketWorkspaceLiveRebindResponse
} from '../../shared/ticket-workspace-live-ipc-boundary'

type RegisteredHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, RegisteredHandler>()
  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: RegisteredHandler) => {
      handlers.set(channel, handler)
    }),
    isTrustedUIRenderer: vi.fn((_sender: unknown) => true)
  }
})

vi.mock('electron', () => ({ ipcMain: { handle: mocks.ipcHandle } }))
vi.mock('./ui', () => ({
  isTrustedUIRenderer: (sender: unknown) => mocks.isTrustedUIRenderer(sender)
}))

const { registerTicketWorkspaceLiveIpcHandlers } = await import('./ticket-workspace-live-ipc')

const presentationRequest = requireParsed<TicketWorkspaceLivePresentationRequest>(
  parseTicketWorkspaceLivePresentationRequest({ requestId: 'AAAAAAAAAAAAAAAAAAAAAA' })
)
const selectionRequest = requireParsed<TicketWorkspaceLiveSelectionRequest>(
  parseTicketWorkspaceLiveSelectionRequest({
    requestId: 'AAAAAAAAAAAAAAAAAAAAAA',
    receiptId: 'AQgwAQgwAQgwAQgwAQgwAQ',
    snapshotRevision: 'a'.repeat(64),
    sourceIdentity: {
      authorityId: 'authority-1',
      ledgerEpoch: 'epoch-1',
      ledgerRevision: 4,
      projectionSequence: 7,
      catalogDigest: 'b'.repeat(64)
    },
    ticketKey: 'ORCA-7',
    repositoryId: 'repo-1'
  })
)

describe('ticket workspace live IPC', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.ipcHandle.mockClear()
    mocks.isTrustedUIRenderer.mockReset().mockReturnValue(true)
  })

  it('registers exactly the three channels and returns unavailable without a provider', async () => {
    registerTicketWorkspaceLiveIpcHandlers()

    expect([...mocks.handlers.keys()]).toEqual([
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation,
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection,
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick
    ])
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation)(
        eventFor(fakeSender()),
        presentationRequest
      )
    ).resolves.toEqual(unavailableTicketWorkspaceLivePresentationResponse(presentationRequest))
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection)(
        eventFor(fakeSender()),
        selectionRequest
      )
    ).resolves.toEqual(unavailableTicketWorkspaceLiveMatchResponse(selectionRequest))
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick)(
        eventFor(fakeSender()),
        selectionRequest
      )
    ).resolves.toEqual(unavailableTicketWorkspaceLiveRebindResponse(selectionRequest))
  })

  it('rejects wrong arity and malformed requests before resolving a provider', async () => {
    const resolveProvider = vi.fn(() => api())
    registerTicketWorkspaceLiveIpcHandlers(resolveProvider)
    const event = eventFor(fakeSender())

    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation)(event)
    ).rejects.toThrow()
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation)(event, presentationRequest, {})
    ).rejects.toThrow()
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation)(event, { requestId: 'bad' })
    ).rejects.toThrow()
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection)(event, {
        ...selectionRequest,
        sourceIdentity: { ...selectionRequest.sourceIdentity, ledgerRevision: -1 }
      })
    ).rejects.toThrow()

    expect(resolveProvider).not.toHaveBeenCalled()
  })

  it('returns correlated unavailable for untrusted, subframe, or replaced-frame callers', async () => {
    const resolveProvider = vi.fn(() => api())
    registerTicketWorkspaceLiveIpcHandlers(resolveProvider)
    const sender = fakeSender()
    const invoke = handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection)

    mocks.isTrustedUIRenderer.mockReturnValue(false)
    await expect(invoke(eventFor(sender), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    mocks.isTrustedUIRenderer.mockReturnValue(true)

    await expect(invoke(eventFor(sender, {}), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    await expect(invoke(eventFor(sender, null), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )

    expect(resolveProvider).not.toHaveBeenCalled()
  })

  it('maps resolver and provider failures to the original parsed request', async () => {
    registerTicketWorkspaceLiveIpcHandlers(() => null)
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick)(
        eventFor(fakeSender()),
        selectionRequest
      )
    ).resolves.toEqual(unavailableTicketWorkspaceLiveRebindResponse(selectionRequest))

    registerTicketWorkspaceLiveIpcHandlers(() => {
      throw new Error('private resolver detail')
    })
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation)(
        eventFor(fakeSender()),
        presentationRequest
      )
    ).resolves.toEqual(unavailableTicketWorkspaceLivePresentationResponse(presentationRequest))

    registerTicketWorkspaceLiveIpcHandlers(() =>
      api({ matchSelection: vi.fn().mockRejectedValue(new Error('private provider detail')) })
    )
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection)(
        eventFor(fakeSender()),
        selectionRequest
      )
    ).resolves.toEqual(unavailableTicketWorkspaceLiveMatchResponse(selectionRequest))
  })

  it('passes only the authenticated sender to the resolver and disposes listeners on throw', async () => {
    const sender = fakeSender()
    const resolveProvider = vi.fn(() => {
      expect(sender.listenerCount('destroyed')).toBe(1)
      throw new Error('private resolver detail')
    })
    registerTicketWorkspaceLiveIpcHandlers(resolveProvider)

    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation)(
        eventFor(sender),
        presentationRequest
      )
    ).resolves.toEqual(unavailableTicketWorkspaceLivePresentationResponse(presentationRequest))
    expect(resolveProvider).toHaveBeenCalledExactlyOnceWith(sender)
    expectCallerListenersRemoved(sender)
  })

  it('rejects malformed and cross-correlated provider replies', async () => {
    registerTicketWorkspaceLiveIpcHandlers(() =>
      api({
        matchSelection: async (request) => ({
          ...request,
          sourceIdentity: {
            ...request.sourceIdentity,
            ledgerRevision: request.sourceIdentity.ledgerRevision + 1
          },
          status: 'matched'
        })
      })
    )

    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection)(
        eventFor(fakeSender()),
        selectionRequest
      )
    ).resolves.toEqual(unavailableTicketWorkspaceLiveMatchResponse(selectionRequest))
  })

  it('preserves valid unsupported and bounded rebound responses', async () => {
    const unsupportedPresentation = {
      status: 'unsupported',
      requestId: presentationRequest.requestId
    } as const
    const rebound = {
      ...selectionRequest,
      status: 'rebound',
      worktreeId: 'repo-1::/repo/worktree'
    } as const
    registerTicketWorkspaceLiveIpcHandlers(() =>
      api({
        getPresentation: async () => unsupportedPresentation,
        rebindSelectionAtClick: async () => rebound
      })
    )

    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation)(
        eventFor(fakeSender()),
        presentationRequest
      )
    ).resolves.toEqual(unsupportedPresentation)
    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick)(
        eventFor(fakeSender()),
        selectionRequest
      )
    ).resolves.toEqual(rebound)
  })

  it.each(['destroyed', 'render-process-gone', 'did-navigate'] as const)(
    'suppresses a pending result after %s and disposes caller listeners',
    async (terminalEvent) => {
      let settle: (value: TicketWorkspaceLiveMatchResponse) => void = () => undefined
      const sender = fakeSender()
      registerTicketWorkspaceLiveIpcHandlers(() => {
        expect(sender.listenerCount('destroyed')).toBe(1)
        return api({
          matchSelection: () =>
            new Promise<TicketWorkspaceLiveMatchResponse>((resolve) => {
              settle = resolve
            })
        })
      })
      const pending = handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection)(
        eventFor(sender),
        selectionRequest
      )

      sender.emit(terminalEvent)
      settle({ ...selectionRequest, status: 'matched' as const })

      await expect(pending).resolves.toEqual(
        unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
      )
      expectCallerListenersRemoved(sender)
    }
  )

  it('preserves same-document and blocked navigations but rejects a replaced main frame', async () => {
    let settle: (value: TicketWorkspaceLiveMatchResponse) => void = () => undefined
    const sender = fakeSender()
    registerTicketWorkspaceLiveIpcHandlers(() =>
      api({
        matchSelection: () =>
          new Promise<TicketWorkspaceLiveMatchResponse>((resolve) => {
            settle = resolve
          })
      })
    )
    const pending = handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection)(
      eventFor(sender),
      selectionRequest
    )
    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    sender.emit('will-navigate', { defaultPrevented: true }, 'https://example.invalid')
    sender.emit('did-navigate-in-page', 'file:///app#route')
    settle({ ...selectionRequest, status: 'matched' as const })

    await expect(pending).resolves.toMatchObject({ status: 'matched' })
    expectCallerListenersRemoved(sender)

    let settleReplaced: (value: TicketWorkspaceLiveMatchResponse) => void = () => undefined
    const replacedSender = fakeSender()
    const originalFrame = replacedSender.mainFrame
    registerTicketWorkspaceLiveIpcHandlers(() =>
      api({
        matchSelection: () =>
          new Promise<TicketWorkspaceLiveMatchResponse>((resolve) => {
            settleReplaced = resolve
          })
      })
    )
    const replacedPending = handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection)(
      eventFor(replacedSender, originalFrame),
      selectionRequest
    )
    replacedSender.mainFrame = {}
    settleReplaced({ ...selectionRequest, status: 'matched' as const })

    await expect(replacedPending).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    expectCallerListenersRemoved(replacedSender)
  })

  it('suppresses results when renderer trust is revoked before settlement', async () => {
    mocks.isTrustedUIRenderer.mockReturnValueOnce(true).mockReturnValueOnce(false)
    registerTicketWorkspaceLiveIpcHandlers(() => api())

    await expect(
      handler(TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection)(
        eventFor(fakeSender()),
        selectionRequest
      )
    ).resolves.toEqual(unavailableTicketWorkspaceLiveMatchResponse(selectionRequest))
  })
})

function api(overrides: Partial<TicketWorkspaceLiveApi> = {}): TicketWorkspaceLiveApi {
  return {
    getPresentation:
      overrides.getPresentation ??
      (async (request) => ({ status: 'unsupported', requestId: request.requestId })),
    matchSelection:
      overrides.matchSelection ?? (async (request) => ({ ...request, status: 'unsupported' })),
    rebindSelectionAtClick:
      overrides.rebindSelectionAtClick ??
      (async (request) => ({ ...request, status: 'unsupported' }))
  }
}

function fakeSender(): EventEmitter & {
  mainFrame: object
  isDestroyed: () => boolean
  getType: () => string
} {
  return Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: () => false,
    getType: () => 'window'
  })
}

function eventFor(
  sender: ReturnType<typeof fakeSender>,
  senderFrame: object | null = sender.mainFrame
): IpcMainInvokeEvent {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only sender, senderFrame and WebContents lifetime methods, all represented by this harness.
  return { sender, senderFrame } as unknown as IpcMainInvokeEvent
}

function handler(channel: string): RegisteredHandler {
  const registered = mocks.handlers.get(channel)
  if (!registered) {
    throw new Error(`No ticket workspace live handler registered for ${channel}`)
  }
  return registered
}

function expectCallerListenersRemoved(sender: EventEmitter): void {
  expect(sender.listenerCount('destroyed')).toBe(0)
  expect(sender.listenerCount('render-process-gone')).toBe(0)
  expect(sender.listenerCount('did-navigate')).toBe(0)
}

function requireParsed<T>(value: T | null): T {
  if (!value) {
    throw new Error('The static live request must pass C1')
  }
  return value
}
