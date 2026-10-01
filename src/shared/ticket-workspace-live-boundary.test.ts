import { describe, expect, it } from 'vitest'
import {
  parseTicketWorkspaceLivePresentationRequest,
  parseTicketWorkspaceLiveSelectionRequest,
  validateTicketWorkspaceLiveMatchResponse,
  validateTicketWorkspaceLivePresentationResponse,
  validateTicketWorkspaceLiveRebindResponse,
  TICKET_WORKSPACE_LIVE_MAX_UTF8_BYTES,
  type TicketWorkspaceLivePresentationRequest,
  type TicketWorkspaceLiveSelectionRequest
} from './ticket-workspace-live-boundary'

const requestId = 'AAAAAAAAAAAAAAAAAAAAAA'
const receiptId = 'AQgwAQgwAQgwAQgwAQgwAQ'
const sourceIdentity = {
  authorityId: 'authority-1',
  ledgerEpoch: 'epoch-1',
  ledgerRevision: 4,
  projectionSequence: 7,
  catalogDigest: 'b'.repeat(64)
}

const presentationRequest: TicketWorkspaceLivePresentationRequest = { requestId }
const selectionRequest: TicketWorkspaceLiveSelectionRequest = {
  requestId,
  receiptId,
  snapshotRevision: 'a'.repeat(64),
  sourceIdentity,
  ticketKey: 'ORCA-7',
  repositoryId: 'repo-1'
}

let bypassedEveryCalls = 0
let bypassedIteratorCalls = 0

class BypassingArray<T> extends Array<T> {
  override every<S extends T>(
    _callback: (value: T, index: number, array: T[]) => value is S,
    _thisArg?: unknown
  ): this is S[]
  override every(
    _callback: (value: T, index: number, array: T[]) => unknown,
    _thisArg?: unknown
  ): boolean {
    bypassedEveryCalls += 1
    return true
  }

  override [Symbol.iterator](): ArrayIterator<T> {
    bypassedIteratorCalls += 1
    return new Array<T>().values()
  }
}

function currentPresentation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'current',
    requestId,
    receiptId,
    snapshotRevision: 'a'.repeat(64),
    sourceIdentity,
    currentnessRemainingMs: 30_000,
    tickets: [],
    ...overrides
  }
}

describe('ticket workspace live boundary', () => {
  it('parses a current presentation and correlates it to its request', () => {
    const response = currentPresentation()

    expect(parseTicketWorkspaceLivePresentationRequest(presentationRequest)).toEqual(
      presentationRequest
    )
    expect(validateTicketWorkspaceLivePresentationResponse(response, presentationRequest)).toEqual(
      response
    )
    expect(
      validateTicketWorkspaceLivePresentationResponse(response, {
        requestId: 'AQgwAQgwAQgwAQgwAQgwAQ'
      })
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        { ...response, currentnessRemainingMs: 0 },
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        { ...response, currentnessRemainingMs: 30_001 },
        presentationRequest
      )
    ).toBeNull()
  })

  it('accepts stale rows without a currentness TTL and rejects a TTL on stale', () => {
    const stale = {
      status: 'stale',
      requestId,
      receiptId,
      snapshotRevision: 'a'.repeat(64),
      sourceIdentity,
      tickets: []
    }

    expect(validateTicketWorkspaceLivePresentationResponse(stale, presentationRequest)).toEqual(
      stale
    )
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        { ...stale, currentnessRemainingMs: 5 },
        presentationRequest
      )
    ).toBeNull()
  })

  it('requires exact status keys and canonical 16-byte request and receipt IDs', () => {
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        { status: 'unavailable', requestId },
        presentationRequest
      )
    ).toEqual({ status: 'unavailable', requestId })
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        { status: 'unsupported', requestId, tickets: [] },
        presentationRequest
      )
    ).toBeNull()
    expect(
      parseTicketWorkspaceLivePresentationRequest({ requestId: 'AAAAAAAAAAAAAAAAAAAAAB' })
    ).toBeNull()
    expect(
      parseTicketWorkspaceLiveSelectionRequest({
        ...selectionRequest,
        receiptId: 'AAAAAAAAAAAAAAAAAAAAAB'
      })
    ).toBeNull()
    expect(
      parseTicketWorkspaceLiveSelectionRequest({ ...selectionRequest, path: '/repo' })
    ).toBeNull()
    expect(
      parseTicketWorkspaceLiveSelectionRequest({ ...selectionRequest, ticketKey: 'bad-0' })
    ).toBeNull()
    expect(
      parseTicketWorkspaceLiveSelectionRequest({ ...selectionRequest, repositoryId: 'A-repo' })
    ).toBeNull()
    expect(
      parseTicketWorkspaceLiveSelectionRequest({
        ...selectionRequest,
        repositoryId: 'a'.repeat(256)
      })
    ).toBeNull()
    expect(
      parseTicketWorkspaceLiveSelectionRequest({
        ...selectionRequest,
        sourceIdentity: { ...sourceIdentity, authorityId: 'é'.repeat(128) }
      })
    ).toBeNull()
  })

  it('rejects inherited fields and hidden or symbol extras at every DTO record boundary', () => {
    const inheritedRequest = Object.create(presentationRequest)
    const inheritedSelection = Object.create(selectionRequest)
    const hiddenTarget: Record<string, unknown> = { ...selectionRequest }
    Object.defineProperty(hiddenTarget, 'target', {
      value: { worktreeId: 'repo-1::/private' },
      enumerable: false
    })
    const selectionWithSymbol: Record<string, unknown> = { ...selectionRequest }
    Object.defineProperty(selectionWithSymbol, Symbol('extra'), { value: true })

    const inheritedIdentity = Object.create(sourceIdentity)
    const responseWithInheritedIdentity = currentPresentation({
      sourceIdentity: inheritedIdentity
    })
    const identityWithSymbol: Record<string, unknown> = { ...sourceIdentity }
    Object.defineProperty(identityWithSymbol, Symbol('extra'), { value: true })

    const inheritedTicket = Object.create({
      ticketKey: 'ORCA-7',
      label: 'Ticket',
      lifecycle: 'ready',
      availability: 'available',
      workspaces: []
    })
    const ticketWithSymbol: Record<string, unknown> = {
      ticketKey: 'ORCA-7',
      label: 'Ticket',
      lifecycle: 'ready',
      availability: 'available',
      workspaces: []
    }
    Object.defineProperty(ticketWithSymbol, Symbol('extra'), { value: true })
    const inheritedWorkspace = Object.create({
      repositoryId: 'repo-1',
      label: 'Repository',
      role: 'isolated',
      actualState: 'ready'
    })
    const workspaceWithSymbol: Record<string, unknown> = {
      repositoryId: 'repo-1',
      label: 'Repository',
      role: 'isolated',
      actualState: 'ready'
    }
    Object.defineProperty(workspaceWithSymbol, Symbol('extra'), { value: true })

    expect(parseTicketWorkspaceLivePresentationRequest(inheritedRequest)).toBeNull()
    expect(parseTicketWorkspaceLiveSelectionRequest(inheritedSelection)).toBeNull()
    expect(parseTicketWorkspaceLiveSelectionRequest(hiddenTarget)).toBeNull()
    expect(parseTicketWorkspaceLiveSelectionRequest(selectionWithSymbol)).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        Object.create(currentPresentation()),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        responseWithInheritedIdentity,
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ sourceIdentity: identityWithSymbol }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ tickets: [inheritedTicket] }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ tickets: [ticketWithSymbol] }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({
          tickets: [
            {
              ticketKey: 'ORCA-7',
              label: 'Ticket',
              lifecycle: 'ready',
              availability: 'available',
              workspaces: [inheritedWorkspace]
            }
          ]
        }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({
          tickets: [
            {
              ticketKey: 'ORCA-7',
              label: 'Ticket',
              lifecycle: 'ready',
              availability: 'available',
              workspaces: [workspaceWithSymbol]
            }
          ]
        }),
        presentationRequest
      )
    ).toBeNull()
  })

  it('checks subclassed ticket and workspace arrays by index without invoking overrides', () => {
    bypassedEveryCalls = 0
    bypassedIteratorCalls = 0
    const ticket: Record<string, unknown> = {
      ticketKey: 'ORCA-7',
      label: 'Ticket',
      lifecycle: 'ready',
      availability: 'available',
      workspaces: []
    }
    Object.defineProperty(ticket, 'target', { value: { worktreeId: 'repo-1::/private' } })
    const ticketRows = new BypassingArray<Record<string, unknown>>()
    ticketRows.push(ticket)

    const workspace: Record<string, unknown> = {
      repositoryId: 'repo-1',
      label: 'Repository',
      role: 'isolated',
      actualState: 'ready'
    }
    Object.defineProperty(workspace, 'target', { value: { worktreeId: 'repo-1::/private' } })
    const workspaceRows = new BypassingArray<Record<string, unknown>>()
    workspaceRows.push(workspace)

    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ tickets: ticketRows }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({
          tickets: [
            {
              ticketKey: 'ORCA-7',
              label: 'Ticket',
              lifecycle: 'ready',
              availability: 'available',
              workspaces: workspaceRows
            }
          ]
        }),
        presentationRequest
      )
    ).toBeNull()
    expect(bypassedEveryCalls).toBe(0)
    expect(bypassedIteratorCalls).toBe(0)
  })

  it('checks row fields, enums, UTF-8 bounds, uniqueness, and rejects unsupported rows', () => {
    const ticket = {
      ticketKey: 'ORCA-7',
      label: 'Ticket',
      lifecycle: 'ready',
      availability: 'available',
      workspaces: [
        { repositoryId: 'repo-1', label: 'Repository', role: 'isolated', actualState: 'ready' }
      ]
    }
    const response = currentPresentation({ tickets: [ticket] })

    expect(
      validateTicketWorkspaceLivePresentationResponse(response, presentationRequest)
    ).not.toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ tickets: [{ ...ticket, label: 'x'.repeat(1_024) }] }),
        presentationRequest
      )
    ).not.toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ tickets: [{ ...ticket, availability: 'unsupported' }] }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ tickets: [{ ...ticket, label: '' }] }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ tickets: [{ ...ticket, label: 'é'.repeat(513) }] }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ tickets: [{ ...ticket, lifecycle: 'unknown' }] }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({
          tickets: [ticket, { ...ticket, label: 'Duplicate key' }]
        }),
        presentationRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({
          tickets: [{ ...ticket, workspaces: [...ticket.workspaces, ...ticket.workspaces] }]
        }),
        presentationRequest
      )
    ).toBeNull()
  })

  it('rejects malformed source identities and out-of-range ticket counts', () => {
    const tooManyTickets = Array.from({ length: 501 }, (_, index) => ({
      ticketKey: `ORCA-${index + 1}`,
      label: 'Ticket',
      lifecycle: 'ready',
      availability: 'available',
      workspaces: []
    }))

    expect(
      parseTicketWorkspaceLiveSelectionRequest({
        ...selectionRequest,
        sourceIdentity: { ...sourceIdentity, ledgerRevision: Number.MAX_SAFE_INTEGER + 1 }
      })
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        currentPresentation({ tickets: tooManyTickets }),
        presentationRequest
      )
    ).toBeNull()
  })

  it('enforces the aggregate workspace limit and the 2 MiB whole-envelope limit', () => {
    const aggregateOverflow = currentPresentation({
      tickets: [
        {
          ticketKey: 'ORCA-1',
          label: 'Ticket',
          lifecycle: 'ready',
          availability: 'available',
          workspaces: Array.from({ length: 2_000 }, (_, index) => ({
            repositoryId: `repo-${index + 1}`,
            label: 'Repository',
            role: 'isolated',
            actualState: 'ready'
          }))
        },
        {
          ticketKey: 'ORCA-2',
          label: 'Ticket',
          lifecycle: 'ready',
          availability: 'available',
          workspaces: [
            { repositoryId: 'repo-1', label: 'Repository', role: 'isolated', actualState: 'ready' }
          ]
        }
      ]
    })
    const oversized = currentPresentation({
      tickets: Array.from({ length: 500 }, (_, ticketIndex) => ({
        ticketKey: `ORCA-${ticketIndex + 1}`,
        label: 'x'.repeat(1_024),
        lifecycle: 'ready',
        availability: 'available',
        workspaces: Array.from({ length: 4 }, (_, workspaceIndex) => ({
          repositoryId: `repo-${workspaceIndex + 1}`,
          label: 'x'.repeat(1_024),
          role: 'isolated',
          actualState: 'ready'
        }))
      }))
    })
    const exactLimit = presentationWithExactByteLength(TICKET_WORKSPACE_LIVE_MAX_UTF8_BYTES)

    expect(
      validateTicketWorkspaceLivePresentationResponse(aggregateOverflow, presentationRequest)
    ).toBeNull()
    expect(
      validateTicketWorkspaceLivePresentationResponse(oversized, presentationRequest)
    ).toBeNull()
    expect(new TextEncoder().encode(JSON.stringify(exactLimit)).byteLength).toBe(
      TICKET_WORKSPACE_LIVE_MAX_UTF8_BYTES
    )
    expect(
      validateTicketWorkspaceLivePresentationResponse(exactLimit, presentationRequest)
    ).not.toBeNull()
  })

  it('correlates match responses against every selector and source field', () => {
    const matched = { status: 'matched', ...selectionRequest }

    expect(parseTicketWorkspaceLiveSelectionRequest(selectionRequest)).toEqual(selectionRequest)
    expect(validateTicketWorkspaceLiveMatchResponse(matched, selectionRequest)).toEqual(matched)
    expect(
      validateTicketWorkspaceLiveMatchResponse(
        { ...matched, sourceIdentity: { ...sourceIdentity, projectionSequence: 8 } },
        selectionRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLiveMatchResponse(
        { ...matched, target: { kind: 'git-worktree' } },
        selectionRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLiveMatchResponse(
        { status: 'unsupported', ...selectionRequest },
        selectionRequest
      )?.status
    ).toBe('unsupported')
  })

  it('accepts a rebound ID only when the existing owner boundary validates its repository', () => {
    const rebound = {
      status: 'rebound',
      ...selectionRequest,
      worktreeId: 'repo-1::/repo/worktree'
    }

    expect(validateTicketWorkspaceLiveRebindResponse(rebound, selectionRequest)).toEqual(rebound)
    expect(
      validateTicketWorkspaceLiveRebindResponse(
        { ...rebound, worktreeId: 'other-repo::/repo/worktree' },
        selectionRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLiveRebindResponse(
        { status: 'unavailable', ...selectionRequest, worktreeId: 'repo-1::/repo/worktree' },
        selectionRequest
      )
    ).toBeNull()
    expect(
      validateTicketWorkspaceLiveRebindResponse(
        { status: 'unavailable', ...selectionRequest },
        selectionRequest
      )
    ).toEqual({ status: 'unavailable', ...selectionRequest })
  })

  it('does not treat the historical fixture envelope as a live response', () => {
    expect(
      validateTicketWorkspaceLivePresentationResponse(
        {
          status: 'fixture',
          provenance: { kind: 'fixture', snapshotCaseId: 'accepted-full-snapshot' },
          tickets: []
        },
        presentationRequest
      )
    ).toBeNull()
  })
})

function presentationWithExactByteLength(targetBytes: number): Record<string, unknown> {
  const build = (labelLength: number) => {
    const labels: { label: string }[] = []
    const tickets = Array.from({ length: 500 }, (_, ticketIndex) => {
      const workspaces = Array.from({ length: 4 }, (_, workspaceIndex) => {
        const workspace = {
          repositoryId: `repo-${workspaceIndex + 1}`,
          label: 'x'.repeat(labelLength),
          role: 'isolated',
          actualState: 'ready'
        }
        labels.push(workspace)
        return workspace
      })
      const ticket = {
        ticketKey: `ORCA-${ticketIndex + 1}`,
        label: 'x'.repeat(labelLength),
        lifecycle: 'ready',
        availability: 'available',
        workspaces
      }
      labels.push(ticket)
      return ticket
    })
    return { response: currentPresentation({ tickets }), labels }
  }
  const byteLength = (value: Record<string, unknown>) =>
    new TextEncoder().encode(JSON.stringify(value) ?? '').byteLength
  let lower = 1
  let upper = 1_024
  let best: ReturnType<typeof build> | undefined
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2)
    const candidate = build(middle)
    if (byteLength(candidate.response) <= targetBytes) {
      best = candidate
      lower = middle + 1
    } else {
      upper = middle - 1
    }
  }
  if (!best) {
    throw new Error('Could not construct a valid DTO below the byte limit')
  }
  let remaining = targetBytes - byteLength(best.response)
  for (const item of best.labels) {
    const extra = Math.min(remaining, 1_024 - item.label.length)
    item.label += 'x'.repeat(extra)
    remaining -= extra
    if (remaining === 0) {
      break
    }
  }
  if (remaining !== 0) {
    throw new Error('Could not fill the DTO to the byte limit')
  }
  return best.response
}
