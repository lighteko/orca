import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TICKET_WORKSPACE_LIVE_IPC_CHANNELS,
  unavailableTicketWorkspaceLiveMatchResponse,
  unavailableTicketWorkspaceLivePresentationResponse,
  unavailableTicketWorkspaceLiveRebindResponse
} from '../../shared/ticket-workspace-live-ipc-boundary'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('electron', () => ({ ipcRenderer: { invoke: mocks.invoke } }))

const { ticketWorkspaceLiveApi } = await import('./ticket-workspace-live-bridge')

const presentationInput = { requestId: 'AAAAAAAAAAAAAAAAAAAAAA' } as const
const sourceIdentity = {
  authorityId: 'authority-1',
  ledgerEpoch: 'epoch-1',
  ledgerRevision: 4,
  projectionSequence: 7,
  catalogDigest: 'b'.repeat(64)
} as const
const selectionInput = {
  requestId: 'AAAAAAAAAAAAAAAAAAAAAA',
  receiptId: 'AQgwAQgwAQgwAQgwAQgwAQ',
  snapshotRevision: 'a'.repeat(64),
  sourceIdentity,
  ticketKey: 'ORCA-7',
  repositoryId: 'repo-1'
} as const

const currentPresentation = {
  status: 'current',
  ...presentationInput,
  receiptId: selectionInput.receiptId,
  snapshotRevision: selectionInput.snapshotRevision,
  sourceIdentity,
  currentnessRemainingMs: 5_000,
  tickets: []
} as const
const stalePresentation = {
  status: 'stale',
  ...presentationInput,
  receiptId: selectionInput.receiptId,
  snapshotRevision: selectionInput.snapshotRevision,
  sourceIdentity,
  tickets: []
} as const
const matchResponse = { ...selectionInput, status: 'matched' } as const
const reboundResponse = {
  ...selectionInput,
  status: 'rebound',
  worktreeId: 'repo-1::/repo/worktree'
} as const

describe('ticket workspace live preload bridge', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
  })

  it('rejects invalid arity and malformed inputs before invoking IPC', async () => {
    const calls = [
      { method: ticketWorkspaceLiveApi.getPresentation, request: presentationInput },
      { method: ticketWorkspaceLiveApi.matchSelection, request: selectionInput },
      { method: ticketWorkspaceLiveApi.rebindSelectionAtClick, request: selectionInput }
    ]
    for (const { method, request } of calls) {
      await expect(Reflect.apply(method, undefined, [])).rejects.toThrow(
        'Invalid ticket workspace live request'
      )
      await expect(Reflect.apply(method, undefined, [request, undefined])).rejects.toThrow(
        'Invalid ticket workspace live request'
      )
      await expect(Reflect.apply(method, undefined, [request, 'extra'])).rejects.toThrow(
        'Invalid ticket workspace live request'
      )
    }

    await expect(
      Reflect.apply(ticketWorkspaceLiveApi.getPresentation, undefined, [
        { ...presentationInput, path: '/secret' }
      ])
    ).rejects.toThrow('Invalid ticket workspace live request')
    await expect(
      Reflect.apply(ticketWorkspaceLiveApi.matchSelection, undefined, [
        { ...selectionInput, target: { worktreeId: 'repo-1::/secret' } }
      ])
    ).rejects.toThrow('Invalid ticket workspace live request')
    await expect(
      Reflect.apply(ticketWorkspaceLiveApi.rebindSelectionAtClick, undefined, [
        { ...selectionInput, runId: 'run-1' }
      ])
    ).rejects.toThrow('Invalid ticket workspace live request')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('forwards parsed requests once on the three frozen channels', async () => {
    mocks.invoke
      .mockResolvedValueOnce(currentPresentation)
      .mockResolvedValueOnce(matchResponse)
      .mockResolvedValueOnce(reboundResponse)

    await expect(ticketWorkspaceLiveApi.getPresentation(presentationInput)).resolves.toEqual(
      currentPresentation
    )
    await expect(ticketWorkspaceLiveApi.matchSelection(selectionInput)).resolves.toEqual(
      matchResponse
    )
    await expect(ticketWorkspaceLiveApi.rebindSelectionAtClick(selectionInput)).resolves.toEqual(
      reboundResponse
    )

    expect(mocks.invoke).toHaveBeenNthCalledWith(
      1,
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.getPresentation,
      presentationInput
    )
    expect(mocks.invoke).toHaveBeenNthCalledWith(
      2,
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.matchSelection,
      selectionInput
    )
    expect(mocks.invoke).toHaveBeenNthCalledWith(
      3,
      TICKET_WORKSPACE_LIVE_IPC_CHANNELS.rebindSelectionAtClick,
      selectionInput
    )
    expect(mocks.invoke.mock.calls[0]?.[1]).not.toBe(presentationInput)
    expect(mocks.invoke.mock.calls[1]?.[1]).not.toBe(selectionInput)
    expect(mocks.invoke.mock.calls[2]?.[1]).not.toBe(selectionInput)
    expect(mocks.invoke.mock.calls[1]?.[1]).toMatchObject({ sourceIdentity })
    expect(mocks.invoke.mock.calls[1]?.[1]).not.toHaveProperty('target')
  })

  it('preserves every validated presentation status and currentness field', async () => {
    const responses = [
      currentPresentation,
      stalePresentation,
      unavailableTicketWorkspaceLivePresentationResponse(presentationInput),
      { status: 'unsupported', requestId: presentationInput.requestId }
    ]
    for (const response of responses) {
      mocks.invoke.mockResolvedValueOnce(response)
      await expect(ticketWorkspaceLiveApi.getPresentation(presentationInput)).resolves.toEqual(
        response
      )
    }
    expect(mocks.invoke).toHaveBeenCalledTimes(responses.length)
  })

  it('preserves valid matched, unavailable, unsupported and exact rebound results', async () => {
    const matchResponses = [
      matchResponse,
      unavailableTicketWorkspaceLiveMatchResponse(selectionInput),
      { ...selectionInput, status: 'unsupported' }
    ]
    for (const response of matchResponses) {
      mocks.invoke.mockResolvedValueOnce(response)
      await expect(ticketWorkspaceLiveApi.matchSelection(selectionInput)).resolves.toEqual(response)
    }

    const rebindResponses = [
      reboundResponse,
      unavailableTicketWorkspaceLiveRebindResponse(selectionInput),
      { ...selectionInput, status: 'unsupported' }
    ]
    for (const response of rebindResponses) {
      mocks.invoke.mockResolvedValueOnce(response)
      await expect(ticketWorkspaceLiveApi.rebindSelectionAtClick(selectionInput)).resolves.toEqual(
        response
      )
    }
    expect(mocks.invoke).toHaveBeenCalledTimes(matchResponses.length + rebindResponses.length)
  })

  it('returns original correlated unavailable replies for transport and response failures', async () => {
    const presentationUnavailable =
      unavailableTicketWorkspaceLivePresentationResponse(presentationInput)
    const matchUnavailable = unavailableTicketWorkspaceLiveMatchResponse(selectionInput)
    const rebindUnavailable = unavailableTicketWorkspaceLiveRebindResponse(selectionInput)

    mocks.invoke.mockRejectedValueOnce(new Error('private transport detail'))
    await expect(ticketWorkspaceLiveApi.getPresentation(presentationInput)).resolves.toEqual(
      presentationUnavailable
    )
    mocks.invoke.mockResolvedValueOnce(null)
    await expect(ticketWorkspaceLiveApi.matchSelection(selectionInput)).resolves.toEqual(
      matchUnavailable
    )
    mocks.invoke.mockResolvedValueOnce({ ...reboundResponse, worktreeId: 'other::/secret' })
    await expect(ticketWorkspaceLiveApi.rebindSelectionAtClick(selectionInput)).resolves.toEqual(
      rebindUnavailable
    )
    mocks.invoke.mockResolvedValueOnce({
      ...currentPresentation,
      requestId: selectionInput.receiptId
    })
    await expect(ticketWorkspaceLiveApi.getPresentation(presentationInput)).resolves.toEqual(
      presentationUnavailable
    )
    mocks.invoke.mockResolvedValueOnce({ ...matchResponse, repositoryId: 'repo-2' })
    await expect(ticketWorkspaceLiveApi.matchSelection(selectionInput)).resolves.toEqual(
      matchUnavailable
    )
    mocks.invoke.mockResolvedValueOnce({
      ...reboundResponse,
      sourceIdentity: { ...sourceIdentity, ledgerEpoch: 'epoch-2' }
    })
    await expect(ticketWorkspaceLiveApi.rebindSelectionAtClick(selectionInput)).resolves.toEqual(
      rebindUnavailable
    )
  })

  it('rejects every selector correlation mismatch from the main reply', async () => {
    const mismatches = [
      { requestId: selectionInput.receiptId },
      { receiptId: selectionInput.requestId },
      { snapshotRevision: 'c'.repeat(64) },
      { sourceIdentity: { ...sourceIdentity, authorityId: 'authority-2' } },
      { sourceIdentity: { ...sourceIdentity, ledgerEpoch: 'epoch-2' } },
      { sourceIdentity: { ...sourceIdentity, ledgerRevision: 5 } },
      { sourceIdentity: { ...sourceIdentity, projectionSequence: 8 } },
      { sourceIdentity: { ...sourceIdentity, catalogDigest: 'c'.repeat(64) } },
      { ticketKey: 'ORCA-8' },
      { repositoryId: 'repo-2' }
    ]
    const unavailable = unavailableTicketWorkspaceLiveMatchResponse(selectionInput)

    for (const mismatch of mismatches) {
      mocks.invoke.mockResolvedValueOnce({ ...matchResponse, ...mismatch })
      await expect(ticketWorkspaceLiveApi.matchSelection(selectionInput)).resolves.toEqual(
        unavailable
      )
    }
    expect(mocks.invoke).toHaveBeenCalledTimes(mismatches.length)
  })
})
