import { EventEmitter } from 'node:events'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
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
import { DesktopRuntimeSenderLifecycle } from './desktop-runtime-sender-lifecycle'
import type { TicketWorkspaceLiveRequestContext } from './ticket-workspace-live-ipc'

type RegisteredHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>
type FakeSender = EventEmitter & {
  id: number
  mainFrame: object
  isDestroyed(): boolean
  getType(): string
  destroy(): void
}
type ProviderResolver = (
  sender: WebContents,
  context: TicketWorkspaceLiveRequestContext
) => TicketWorkspaceLiveApi | null

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

  it('registers the three channels and stays unavailable when lifecycle/provider are absent', async () => {
    registerTicketWorkspaceLiveIpcHandlers()

    expect([...mocks.handlers.keys()]).toEqual([
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation,
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection,
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick
    ])
    await expect(invoke('getPresentation', fakeSender(), presentationRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLivePresentationResponse(presentationRequest)
    )
    await expect(invoke('matchSelection', fakeSender(), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    await expect(invoke('rebindSelectionAtClick', fakeSender(), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveRebindResponse(selectionRequest)
    )
  })

  it('rejects wrong arity and malformed requests before lifecycle or provider access', async () => {
    const sender = fakeSender()
    const lifecycleGetter = vi.fn(() => createLifecycle())
    const provider = vi.fn<ProviderResolver>(() => api())
    registerTicketWorkspaceLiveIpcHandlers(provider, lifecycleGetter)
    const event = eventFor(sender)

    await expect(handler('getPresentation')(event)).rejects.toThrow()
    await expect(handler('getPresentation')(event, presentationRequest, {})).rejects.toThrow()
    await expect(handler('getPresentation')(event, { requestId: 'bad' })).rejects.toThrow()
    await expect(
      handler('matchSelection')(event, {
        ...selectionRequest,
        sourceIdentity: { ...selectionRequest.sourceIdentity, ledgerRevision: -1 }
      })
    ).rejects.toThrow()

    expect(lifecycleGetter).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })

  it('does not enroll or resolve providers for untrusted, subframe, or replaced-frame calls', async () => {
    const sender = fakeSender()
    const lifecycle = createLifecycle()
    const lifecycleGetter = vi.fn(() => lifecycle)
    const provider = vi.fn<ProviderResolver>(() => api())
    registerTicketWorkspaceLiveIpcHandlers(provider, lifecycleGetter)
    const invokeMatch = handler('matchSelection')

    mocks.isTrustedUIRenderer.mockReturnValue(false)
    await expect(invokeMatch(eventFor(sender), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    mocks.isTrustedUIRenderer.mockReturnValue(true)
    await expect(invokeMatch(eventFor(sender, null), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    await expect(invokeMatch(eventFor(sender, {}), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    sender.mainFrame = {}
    await expect(invokeMatch(eventFor(sender, {}), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )

    expect(lifecycleGetter).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
    expect(sender.listenerCount('did-navigate')).toBe(0)
  })

  it('returns unavailable without enrollment when the existing lifecycle getter returns null', async () => {
    const sender = fakeSender()
    const lifecycleGetter = vi.fn(() => null)
    const provider = vi.fn<ProviderResolver>(() => api())
    registerTicketWorkspaceLiveIpcHandlers(provider, lifecycleGetter)

    await expect(invoke('matchSelection', sender, selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )

    expect(lifecycleGetter).toHaveBeenCalledOnce()
    expect(provider).not.toHaveBeenCalled()
    expect(sender.listenerCount('did-navigate')).toBe(0)
    expectTemporaryListenersDisposed(sender, false)
  })

  it('passes the original signal and a lookup-only current-document check to a valid resolver', async () => {
    const sender = fakeSender()
    const provider = vi.fn<ProviderResolver>((_sender, context) => {
      expect(context.signal.aborted).toBe(false)
      expect(context.isCurrentDocument()).toBe(true)
      return api()
    })
    const lifecycle = createLifecycle()
    registerTicketWorkspaceLiveIpcHandlers(provider, () => lifecycle)

    await expect(invoke('getPresentation', sender, presentationRequest)).resolves.toEqual({
      status: 'unsupported',
      requestId: presentationRequest.requestId
    })

    expect(provider).toHaveBeenCalledOnce()
    expect(provider.mock.calls[0]?.[0]).toBe(sender)
    expectTemporaryListenersDisposed(sender)
    expect(sender.listenerCount('did-navigate')).toBe(1)
    expect(sender.listenerCount('render-process-gone')).toBe(1)
    expect(sender.listenerCount('destroyed')).toBe(1)
  })

  it('maps resolver/provider throws to original parsed correlation', async () => {
    const sender = fakeSender()
    const lifecycle = createLifecycle()
    registerTicketWorkspaceLiveIpcHandlers(
      () => {
        throw new Error('private resolver detail')
      },
      () => lifecycle
    )
    await expect(invoke('getPresentation', sender, presentationRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLivePresentationResponse(presentationRequest)
    )
    expectTemporaryListenersDisposed(sender)

    const providerSender = fakeSender()
    registerGuarded(() =>
      api({ matchSelection: vi.fn().mockRejectedValue(new Error('private provider detail')) })
    )
    await expect(invoke('matchSelection', providerSender, selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    expectTemporaryListenersDisposed(providerSender)
  })

  it('rechecks the captured document after the synchronous resolver returns', async () => {
    const sender = fakeSender()
    const matchSelection = vi.fn(async (request: TicketWorkspaceLiveSelectionRequest) => ({
      ...request,
      status: 'matched' as const
    }))
    const resolver = vi.fn((_sender: WebContents, context: TicketWorkspaceLiveRequestContext) => {
      context.setFinalPublicationGuard(() => true)
      sender.mainFrame = {}
      return api({ matchSelection })
    })
    registerTicketWorkspaceLiveIpcHandlers(resolver, () => createLifecycle())

    await expect(invoke('matchSelection', sender, selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    expect(resolver).toHaveBeenCalledOnce()
    expect(matchSelection).not.toHaveBeenCalled()
  })

  it('maps a valid call with a missing provider to its original selection request', async () => {
    const sender = fakeSender()
    const resolver = vi.fn<ProviderResolver>(() => null)
    registerTicketWorkspaceLiveIpcHandlers(resolver, () => createLifecycle())

    await expect(invoke('rebindSelectionAtClick', sender, selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveRebindResponse(selectionRequest)
    )
    expect(resolver).toHaveBeenCalledOnce()
    expectTemporaryListenersDisposed(sender)
  })

  it('preserves valid negative responses without requiring or evaluating a publication guard', async () => {
    const guard = vi.fn(() => true)
    const sender = fakeSender()
    const stale = {
      status: 'stale',
      requestId: presentationRequest.requestId,
      receiptId: selectionRequest.receiptId,
      snapshotRevision: selectionRequest.snapshotRevision,
      sourceIdentity: selectionRequest.sourceIdentity,
      tickets: []
    } as const
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, context) => {
        context.setFinalPublicationGuard(guard)
        return api({
          getPresentation: async () => ({
            status: 'unsupported',
            requestId: presentationRequest.requestId
          })
        })
      },
      () => createLifecycle()
    )

    await expect(invoke('getPresentation', sender, presentationRequest)).resolves.toEqual({
      status: 'unsupported',
      requestId: presentationRequest.requestId
    })
    await expect(invoke('matchSelection', fakeSender(), selectionRequest)).resolves.toEqual({
      ...selectionRequest,
      status: 'unsupported'
    })

    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, context) => {
        context.setFinalPublicationGuard(guard)
        return api({ getPresentation: async () => stale })
      },
      () => createLifecycle()
    )
    await expect(invoke('getPresentation', fakeSender(), presentationRequest)).resolves.toEqual(
      stale
    )
    expect(guard).not.toHaveBeenCalled()
  })

  it('requires exactly one successful guard for each positive response', async () => {
    const matched = { ...selectionRequest, status: 'matched' } as const

    const missingGuardSender = fakeSender()
    registerTicketWorkspaceLiveIpcHandlers(
      () => api({ matchSelection: async () => matched }),
      () => createLifecycle()
    )
    await expect(invoke('matchSelection', missingGuardSender, selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )

    for (const guard of [
      () => false,
      () => {
        throw new Error('private guard detail')
      }
    ]) {
      const sender = fakeSender()
      registerTicketWorkspaceLiveIpcHandlers(
        (_sender, context) => {
          context.setFinalPublicationGuard(guard)
          return api({ matchSelection: async () => matched })
        },
        () => createLifecycle()
      )
      await expect(invoke('matchSelection', sender, selectionRequest)).resolves.toEqual(
        unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
      )
    }

    const guard = vi.fn(() => true)
    const positiveSender = fakeSender()
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, context) => {
        context.setFinalPublicationGuard(guard)
        return api({
          rebindSelectionAtClick: async () => ({
            ...selectionRequest,
            status: 'rebound',
            worktreeId: 'repo-1::/repo/worktree'
          })
        })
      },
      () => createLifecycle()
    )
    await expect(
      invoke('rebindSelectionAtClick', positiveSender, selectionRequest)
    ).resolves.toMatchObject({
      status: 'rebound',
      worktreeId: 'repo-1::/repo/worktree'
    })
    expect(guard).toHaveBeenCalledOnce()

    const currentPresentation = {
      status: 'current',
      requestId: presentationRequest.requestId,
      receiptId: selectionRequest.receiptId,
      snapshotRevision: selectionRequest.snapshotRevision,
      sourceIdentity: selectionRequest.sourceIdentity,
      currentnessRemainingMs: 30_000,
      tickets: []
    } as const
    const currentGuard = vi.fn(() => true)
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, context) => {
        context.setFinalPublicationGuard(currentGuard)
        return api({ getPresentation: async () => currentPresentation })
      },
      () => createLifecycle()
    )
    await expect(invoke('getPresentation', fakeSender(), presentationRequest)).resolves.toEqual(
      currentPresentation
    )
    expect(currentGuard).toHaveBeenCalledOnce()
  })

  it('rejects duplicate registration while pending and reentrant registration during finalization', async () => {
    const sender = fakeSender()
    const contexts: TicketWorkspaceLiveRequestContext[] = []
    let settle: (response: TicketWorkspaceLiveMatchResponse) => void = () => undefined
    const firstGuard = vi.fn(() => true)
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, requestContext) => {
        contexts.push(requestContext)
        requestContext.setFinalPublicationGuard(firstGuard)
        return api({
          matchSelection: () =>
            new Promise<TicketWorkspaceLiveMatchResponse>((resolve) => {
              settle = resolve
            })
        })
      },
      () => createLifecycle()
    )
    const pending = invoke('matchSelection', sender, selectionRequest)
    contexts[0]?.setFinalPublicationGuard(() => false)
    settle({ ...selectionRequest, status: 'matched' })
    await expect(pending).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    expect(firstGuard).toHaveBeenCalledOnce()

    const reentrantSender = fakeSender()
    const reentrantContexts: TicketWorkspaceLiveRequestContext[] = []
    const reentrantGuard = vi.fn(() => {
      reentrantContexts[0]?.setFinalPublicationGuard(() => true)
      return true
    })
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, requestContext) => {
        reentrantContexts.push(requestContext)
        requestContext.setFinalPublicationGuard(reentrantGuard)
        return api({ matchSelection: async () => ({ ...selectionRequest, status: 'matched' }) })
      },
      () => createLifecycle()
    )
    await expect(invoke('matchSelection', reentrantSender, selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    expect(reentrantGuard).toHaveBeenCalledOnce()
  })

  it.each(['receipt', 'source', 'catalog'] as const)(
    'rechecks the invocation witness after response validation when %s changes in a queued microtask',
    async (changedFact) => {
      const witness = { receipt: true, source: true, catalog: true }
      const guard = vi.fn(() => witness.receipt && witness.source && witness.catalog)
      const sender = fakeSender()
      registerTicketWorkspaceLiveIpcHandlers(
        (_sender, context) => {
          context.setFinalPublicationGuard(guard)
          return api({
            matchSelection: () => {
              queueMicrotask(() => {
                witness[changedFact] = false
              })
              return Promise.resolve({ ...selectionRequest, status: 'matched' })
            }
          })
        },
        () => createLifecycle()
      )

      await expect(invoke('matchSelection', sender, selectionRequest)).resolves.toEqual(
        unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
      )
      expect(guard).toHaveBeenCalledOnce()
      expect(unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)).toMatchObject({
        requestId: selectionRequest.requestId,
        receiptId: selectionRequest.receiptId,
        snapshotRevision: selectionRequest.snapshotRevision,
        sourceIdentity: selectionRequest.sourceIdentity,
        ticketKey: selectionRequest.ticketKey,
        repositoryId: selectionRequest.repositoryId
      })
    }
  )

  it.each([
    { target: 'document-currentness', read: 1 },
    { target: 'trusted-main-frame', read: 3 }
  ])(
    'rechecks guard registration after the final $target observation',
    async ({ read: targetRead }) => {
      const sender = fakeSender()
      const guard = vi.fn(() => true)
      const contexts: TicketWorkspaceLiveRequestContext[] = []
      let armed = false
      let mainFrameReads = 0
      setMainFrameReadHook(sender, () => {
        if (!armed) {
          return
        }
        mainFrameReads += 1
        if (mainFrameReads === targetRead) {
          contexts[0]?.setFinalPublicationGuard(() => false)
        }
      })
      registerTicketWorkspaceLiveIpcHandlers(
        (_sender, requestContext) => {
          contexts.push(requestContext)
          requestContext.setFinalPublicationGuard(guard)
          return api({
            matchSelection: async (request) => {
              armed = true
              return { ...request, status: 'matched' }
            }
          })
        },
        () => createLifecycle()
      )

      await expect(invoke('matchSelection', sender, selectionRequest)).resolves.toEqual(
        unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
      )
      expect(guard).toHaveBeenCalledOnce()
      expect(mainFrameReads).toBe(3)
    }
  )

  it('does not evaluate the publication guard for malformed or cross-correlated replies', async () => {
    const guard = vi.fn(() => true)
    const sender = fakeSender()
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, context) => {
        context.setFinalPublicationGuard(guard)
        return api({
          matchSelection: vi.fn().mockResolvedValue({
            ...selectionRequest,
            extra: 'not part of C1',
            status: 'matched'
          })
        })
      },
      () => createLifecycle()
    )

    await expect(invoke('matchSelection', sender, selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    expect(guard).not.toHaveBeenCalled()
  })

  it('rejects a schema-valid reply with a changed ledger revision before guard evaluation', async () => {
    const guard = vi.fn(() => true)
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, context) => {
        context.setFinalPublicationGuard(guard)
        return api({
          matchSelection: async (request) => ({
            ...request,
            sourceIdentity: {
              ...request.sourceIdentity,
              ledgerRevision: request.sourceIdentity.ledgerRevision + 1
            },
            status: 'matched'
          })
        })
      },
      () => createLifecycle()
    )

    await expect(invoke('matchSelection', fakeSender(), selectionRequest)).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    expect(guard).not.toHaveBeenCalled()
  })

  it('keeps concurrent guard cells isolated by invocation', async () => {
    const firstSender = fakeSender()
    const secondSender = fakeSender()
    const contexts: TicketWorkspaceLiveRequestContext[] = []
    const settle: ((response: TicketWorkspaceLiveMatchResponse) => void)[] = []
    const secondGuard = vi.fn(() => true)
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, context) => {
        contexts.push(context)
        context.setFinalPublicationGuard(contexts.length === 1 ? () => true : secondGuard)
        return api({
          matchSelection: () =>
            new Promise<TicketWorkspaceLiveMatchResponse>((resolve) => {
              settle.push(resolve)
            })
        })
      },
      () => createLifecycle()
    )

    const firstPending = invoke('matchSelection', firstSender, selectionRequest)
    const secondPending = invoke('matchSelection', secondSender, selectionRequest)
    contexts[0]?.setFinalPublicationGuard(() => false)
    settle[0]?.({ ...selectionRequest, status: 'matched' })
    settle[1]?.({ ...selectionRequest, status: 'matched' })

    await expect(firstPending).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
    await expect(secondPending).resolves.toMatchObject({ status: 'matched' })
    expect(secondGuard).toHaveBeenCalledOnce()
  })

  it.each(['destroyed', 'render-process-gone', 'did-navigate'] as const)(
    'suppresses a pending positive result after %s and disposes request listeners',
    async (terminalEvent) => {
      let settle: (value: TicketWorkspaceLiveMatchResponse) => void = () => undefined
      const sender = fakeSender()
      registerTicketWorkspaceLiveIpcHandlers(
        (_sender, context) => {
          context.setFinalPublicationGuard(() => true)
          return api({
            matchSelection: () =>
              new Promise<TicketWorkspaceLiveMatchResponse>((resolve) => {
                settle = resolve
              })
          })
        },
        () => createLifecycle()
      )
      const pending = invoke('matchSelection', sender, selectionRequest)

      if (terminalEvent === 'destroyed') {
        sender.destroy()
      } else {
        sender.emit(terminalEvent)
      }
      settle({ ...selectionRequest, status: 'matched' })

      await expect(pending).resolves.toEqual(
        unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
      )
      expectTemporaryListenersDisposed(sender, true, terminalEvent === 'destroyed')
    }
  )

  it('preserves same-document and blocked navigation but rejects replaced frames', async () => {
    let settle: (value: TicketWorkspaceLiveMatchResponse) => void = () => undefined
    const sender = fakeSender()
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, context) => {
        context.setFinalPublicationGuard(() => true)
        return api({
          matchSelection: () =>
            new Promise<TicketWorkspaceLiveMatchResponse>((resolve) => {
              settle = resolve
            })
        })
      },
      () => createLifecycle()
    )
    const pending = invoke('matchSelection', sender, selectionRequest)
    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    sender.emit('will-navigate', { defaultPrevented: true }, 'https://example.invalid')
    sender.emit('did-navigate-in-page', 'file:///app#route')
    settle({ ...selectionRequest, status: 'matched' })
    await expect(pending).resolves.toMatchObject({ status: 'matched' })

    const replacedSender = fakeSender()
    const originalFrame = replacedSender.mainFrame
    let settleReplaced: (value: TicketWorkspaceLiveMatchResponse) => void = () => undefined
    registerTicketWorkspaceLiveIpcHandlers(
      (_sender, context) => {
        context.setFinalPublicationGuard(() => true)
        return api({
          matchSelection: () =>
            new Promise<TicketWorkspaceLiveMatchResponse>((resolve) => {
              settleReplaced = resolve
            })
        })
      },
      () => createLifecycle()
    )
    const replacedPending = invoke(
      'matchSelection',
      replacedSender,
      selectionRequest,
      originalFrame
    )
    replacedSender.mainFrame = {}
    settleReplaced({ ...selectionRequest, status: 'matched' })
    await expect(replacedPending).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
  })

  it('suppresses a result when renderer trust is revoked before settlement', async () => {
    let settle: (response: TicketWorkspaceLiveMatchResponse) => void = () => undefined
    const sender = fakeSender()
    const resolver = vi.fn<ProviderResolver>((_sender, context) => {
      context.setFinalPublicationGuard(() => true)
      return api({
        matchSelection: () =>
          new Promise<TicketWorkspaceLiveMatchResponse>((resolve) => {
            settle = resolve
          })
      })
    })
    registerTicketWorkspaceLiveIpcHandlers(resolver, () => createLifecycle())
    const pending = invoke('matchSelection', sender, selectionRequest)
    expect(resolver).toHaveBeenCalledOnce()
    mocks.isTrustedUIRenderer.mockReturnValue(false)
    settle({ ...selectionRequest, status: 'matched' })

    await expect(pending).resolves.toEqual(
      unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    )
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

function registerGuarded(createApi: ProviderResolver): void {
  registerTicketWorkspaceLiveIpcHandlers(
    (sender, context) => {
      context.setFinalPublicationGuard(() => true)
      return createApi(sender, context)
    },
    () => createLifecycle()
  )
}

function createLifecycle(): DesktopRuntimeSenderLifecycle {
  return new DesktopRuntimeSenderLifecycle({ cleanupSubscriptionsForConnection: vi.fn() })
}

let nextSenderId = 1
function fakeSender(): FakeSender {
  let destroyed = false
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    id: nextSenderId++,
    mainFrame: {},
    isDestroyed: () => destroyed,
    getType: () => 'window',
    destroy: () => {
      destroyed = true
      emitter.emit('destroyed')
    }
  })
}

function eventFor(
  sender: FakeSender,
  senderFrame: object | null = sender.mainFrame
): IpcMainInvokeEvent {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only sender and senderFrame fields represented by this harness.
  return { sender, senderFrame } as unknown as IpcMainInvokeEvent
}

function setMainFrameReadHook(sender: FakeSender, hook: () => void): void {
  let mainFrame = sender.mainFrame
  Object.defineProperty(sender, 'mainFrame', {
    configurable: true,
    get: () => {
      hook()
      return mainFrame
    },
    set: (value: object) => {
      mainFrame = value
    }
  })
}

function handler(
  method: 'getPresentation' | 'matchSelection' | 'rebindSelectionAtClick'
): RegisteredHandler {
  const channel = TICKET_WORKSPACE_LIVE_IPC_CHANNELS[method]
  const registered = mocks.handlers.get(channel)
  if (!registered) {
    throw new Error(`No ticket workspace live handler registered for ${channel}`)
  }
  return registered
}

function invoke(
  method: 'getPresentation' | 'matchSelection' | 'rebindSelectionAtClick',
  sender: FakeSender,
  request: TicketWorkspaceLivePresentationRequest | TicketWorkspaceLiveSelectionRequest,
  senderFrame: object | null = sender.mainFrame
): Promise<unknown> {
  return handler(method)(eventFor(sender, senderFrame), request)
}

function expectTemporaryListenersDisposed(
  sender: FakeSender,
  hasPersistentLifecycleListeners = true,
  destroyedEvent = false
): void {
  const persistent = hasPersistentLifecycleListeners ? 1 : 0
  expect(sender.listenerCount('render-process-gone')).toBe(persistent)
  expect(sender.listenerCount('did-navigate')).toBe(persistent)
  expect(sender.listenerCount('destroyed')).toBe(destroyedEvent ? 0 : persistent)
}

function requireParsed<T>(value: T | null): T {
  if (!value) {
    throw new Error('The static live request must pass C1')
  }
  return value
}
