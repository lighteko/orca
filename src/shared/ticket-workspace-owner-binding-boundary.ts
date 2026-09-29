import { splitWorktreeId } from './worktree/id'

export const TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL = 'ticketWorkspace:matchFixtureSelection'
export const TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL = 'ticketWorkspace:rebindFixtureSelection'

export const TICKET_WORKSPACE_SELECTOR_MAX_ID_UTF8_BYTES = 255
export const TICKET_WORKSPACE_REBOUND_ID_MAX_CODE_UNITS = 32_767

export type TicketWorkspaceFixtureSelection = Readonly<{
  snapshotRevision: string
  ticketKey: string
  repositoryId: string
}>

export type TicketWorkspaceFixtureMatchResponse =
  | ({ status: 'matched' | 'unavailable' } & TicketWorkspaceFixtureSelection)
  | { status: 'unavailable' }

export type TicketWorkspaceFixtureRebindResponse =
  | ({ status: 'rebound'; worktreeId: string } & TicketWorkspaceFixtureSelection)
  | ({ status: 'unavailable' } & TicketWorkspaceFixtureSelection)
  | { status: 'unavailable' }

export function parseTicketWorkspaceFixtureSelection(
  value: unknown
): TicketWorkspaceFixtureSelection | null {
  try {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, ['snapshotRevision', 'ticketKey', 'repositoryId'])
    ) {
      return null
    }
    const { snapshotRevision, ticketKey, repositoryId } = value
    if (!isValidSnapshotRevision(snapshotRevision)) {
      return null
    }
    if (!isContractIdentifier(ticketKey) || !/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(ticketKey)) {
      return null
    }
    if (!isContractIdentifier(repositoryId) || !/^[a-z0-9][a-z0-9._-]*$/.test(repositoryId)) {
      return null
    }
    return Object.freeze({ snapshotRevision, ticketKey, repositoryId })
  } catch {
    return null
  }
}

export function isBoundedOrcaWorktreeId(value: unknown, repositoryId: string): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    return false
  }
  if (value.length > TICKET_WORKSPACE_REBOUND_ID_MAX_CODE_UNITS) {
    return false
  }
  const parsed = splitWorktreeId(value)
  return parsed !== null && parsed.repoId === repositoryId && parsed.worktreePath.length > 0
}

export function unavailableTicketWorkspaceFixtureMatchResponse(
  selection?: TicketWorkspaceFixtureSelection
): TicketWorkspaceFixtureMatchResponse {
  return selection ? { status: 'unavailable', ...selection } : { status: 'unavailable' }
}

export function unavailableTicketWorkspaceFixtureRebindResponse(
  selection?: TicketWorkspaceFixtureSelection
): TicketWorkspaceFixtureRebindResponse {
  return selection ? { status: 'unavailable', ...selection } : { status: 'unavailable' }
}

export function reboundTicketWorkspaceFixtureResponse(
  selection: TicketWorkspaceFixtureSelection,
  worktreeId: unknown
): TicketWorkspaceFixtureRebindResponse {
  return isBoundedOrcaWorktreeId(worktreeId, selection.repositoryId)
    ? { status: 'rebound', ...selection, worktreeId }
    : unavailableTicketWorkspaceFixtureRebindResponse(selection)
}

export function validateTicketWorkspaceFixtureMatchResponse(
  value: unknown
): TicketWorkspaceFixtureMatchResponse {
  try {
    if (!isRecord(value)) {
      return unavailableTicketWorkspaceFixtureMatchResponse()
    }
    if (value.status === 'unavailable' && hasExactKeys(value, ['status'])) {
      return unavailableTicketWorkspaceFixtureMatchResponse()
    }
    if (
      (value.status !== 'matched' && value.status !== 'unavailable') ||
      !hasExactKeys(value, ['status', 'snapshotRevision', 'ticketKey', 'repositoryId'])
    ) {
      return unavailableTicketWorkspaceFixtureMatchResponse()
    }
    const selection = parseTicketWorkspaceFixtureSelection({
      snapshotRevision: value.snapshotRevision,
      ticketKey: value.ticketKey,
      repositoryId: value.repositoryId
    })
    if (!selection) {
      return unavailableTicketWorkspaceFixtureMatchResponse()
    }
    return { status: value.status, ...selection }
  } catch {
    return unavailableTicketWorkspaceFixtureMatchResponse()
  }
}

export function validateTicketWorkspaceFixtureRebindResponse(
  value: unknown
): TicketWorkspaceFixtureRebindResponse {
  try {
    if (!isRecord(value)) {
      return unavailableTicketWorkspaceFixtureRebindResponse()
    }
    if (value.status === 'unavailable' && hasExactKeys(value, ['status'])) {
      return unavailableTicketWorkspaceFixtureRebindResponse()
    }
    if (value.status === 'unavailable') {
      if (!hasExactKeys(value, ['status', 'snapshotRevision', 'ticketKey', 'repositoryId'])) {
        return unavailableTicketWorkspaceFixtureRebindResponse()
      }
      const selection = parseTicketWorkspaceFixtureSelection({
        snapshotRevision: value.snapshotRevision,
        ticketKey: value.ticketKey,
        repositoryId: value.repositoryId
      })
      return selection
        ? unavailableTicketWorkspaceFixtureRebindResponse(selection)
        : unavailableTicketWorkspaceFixtureRebindResponse()
    }
    if (
      value.status !== 'rebound' ||
      !hasExactKeys(value, [
        'status',
        'snapshotRevision',
        'ticketKey',
        'repositoryId',
        'worktreeId'
      ])
    ) {
      return unavailableTicketWorkspaceFixtureRebindResponse()
    }
    const selection = parseTicketWorkspaceFixtureSelection({
      snapshotRevision: value.snapshotRevision,
      ticketKey: value.ticketKey,
      repositoryId: value.repositoryId
    })
    if (!selection || !isBoundedOrcaWorktreeId(value.worktreeId, selection.repositoryId)) {
      return unavailableTicketWorkspaceFixtureRebindResponse()
    }
    return { status: 'rebound', ...selection, worktreeId: value.worktreeId }
  } catch {
    return unavailableTicketWorkspaceFixtureRebindResponse()
  }
}

function isValidSnapshotRevision(value: unknown): value is string {
  return typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value)
}

function isContractIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= TICKET_WORKSPACE_SELECTOR_MAX_ID_UTF8_BYTES &&
    new TextEncoder().encode(value).byteLength <= TICKET_WORKSPACE_SELECTOR_MAX_ID_UTF8_BYTES
  )
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value)
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => typeof key === 'string' && expectedKeys.includes(key))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype === null || prototype === Object.prototype) {
    return true
  }
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
  return (
    Object.getPrototypeOf(prototype) === null &&
    typeof constructor === 'function' &&
    constructor.name === 'Object' &&
    Object.getOwnPropertyDescriptor(constructor, 'prototype')?.value === prototype
  )
}
