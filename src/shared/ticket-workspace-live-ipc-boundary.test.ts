import { describe, expect, it } from 'vitest'
import {
  parseTicketWorkspaceLivePresentationRequest,
  parseTicketWorkspaceLiveSelectionRequest,
  validateTicketWorkspaceLiveMatchResponse,
  validateTicketWorkspaceLivePresentationResponse,
  validateTicketWorkspaceLiveRebindResponse
} from './ticket-workspace-live-boundary'
import {
  TICKET_WORKSPACE_LIVE_IPC_CHANNELS,
  unavailableTicketWorkspaceLiveMatchResponse,
  unavailableTicketWorkspaceLivePresentationResponse,
  unavailableTicketWorkspaceLiveRebindResponse,
  type TicketWorkspaceLiveIpcContract
} from './ticket-workspace-live-ipc-boundary'

const presentationRequest = parseTicketWorkspaceLivePresentationRequest({
  requestId: 'AAAAAAAAAAAAAAAAAAAAAA'
})
const selectionRequest = parseTicketWorkspaceLiveSelectionRequest({
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

if (!presentationRequest || !selectionRequest) {
  throw new Error('The static IPC boundary requests must satisfy C1')
}

describe('ticket workspace live IPC boundary', () => {
  it('declares exactly the C1 methods on unique channels', () => {
    const channels = Object.values(TICKET_WORKSPACE_LIVE_IPC_CHANNELS)

    expect(channels).toEqual([
      'ticketWorkspaceLive:getPresentation',
      'ticketWorkspaceLive:matchSelection',
      'ticketWorkspaceLive:rebindSelectionAtClick'
    ])
    expect(new Set(channels).size).toBe(channels.length)

    const presentation: TicketWorkspaceLiveIpcContract[typeof TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation] =
      {
        request: presentationRequest,
        response: unavailableTicketWorkspaceLivePresentationResponse(presentationRequest)
      }
    const match: TicketWorkspaceLiveIpcContract[typeof TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection] =
      {
        request: selectionRequest,
        response: unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
      }
    const rebind: TicketWorkspaceLiveIpcContract[typeof TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick] =
      {
        request: selectionRequest,
        response: unavailableTicketWorkspaceLiveRebindResponse(selectionRequest)
      }

    expect(presentation.response.status).toBe('unavailable')
    expect(match.response.status).toBe('unavailable')
    expect(rebind.response.status).toBe('unavailable')
  })

  it('builds unavailable replies accepted by C1 with full original selection correlation', () => {
    const presentation = unavailableTicketWorkspaceLivePresentationResponse(presentationRequest)
    const match = unavailableTicketWorkspaceLiveMatchResponse(selectionRequest)
    const rebind = unavailableTicketWorkspaceLiveRebindResponse(selectionRequest)

    expect(
      validateTicketWorkspaceLivePresentationResponse(presentation, presentationRequest)
    ).toEqual({ status: 'unavailable', requestId: presentationRequest.requestId })
    expect(validateTicketWorkspaceLiveMatchResponse(match, selectionRequest)).toEqual(match)
    expect(validateTicketWorkspaceLiveRebindResponse(rebind, selectionRequest)).toEqual(rebind)
    expect(match).toEqual({ ...selectionRequest, status: 'unavailable' })
    expect(rebind).toEqual({ ...selectionRequest, status: 'unavailable' })
    expect(match.sourceIdentity).not.toBe(selectionRequest.sourceIdentity)
    expect(rebind.sourceIdentity).not.toBe(selectionRequest.sourceIdentity)
  })
})
