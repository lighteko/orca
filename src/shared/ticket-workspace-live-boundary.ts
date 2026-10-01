import { z } from 'zod'
import ticketNavigatorSnapshotArtifact from '@lighteko/ticket-workspace-contracts/artifacts/ticket-navigator-snapshot-v1.json'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1' with {
  'resolution-mode': 'import'
}
import { isBoundedOrcaWorktreeId } from './ticket-workspace-owner-binding-boundary'
import {
  hasExactMatchResponseShape,
  hasExactPresentationRequestShape,
  hasExactPresentationResponseShape,
  hasExactRebindResponseShape,
  hasExactSelectionRequestShape
} from './ticket-workspace-live-boundary-shape'

export const TICKET_WORKSPACE_LIVE_MAX_TICKETS = 500
export const TICKET_WORKSPACE_LIVE_MAX_WORKSPACES = 2_000
export const TICKET_WORKSPACE_LIVE_MAX_IDENTIFIER_UTF8_BYTES = 255
export const TICKET_WORKSPACE_LIVE_MAX_LABEL_UTF8_BYTES = 1_024
export const TICKET_WORKSPACE_LIVE_MAX_CURRENTNESS_MS = 30_000
export const TICKET_WORKSPACE_LIVE_MAX_UTF8_BYTES =
  ticketNavigatorSnapshotArtifact.semanticConstraints.snapshotMaxUtf8Bytes

const requestIdSchema = z.string().refine(isCanonicalRequestId)
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
const identifierSchema = z
  .string()
  .min(1)
  .refine((value) => utf8ByteLength(value) <= TICKET_WORKSPACE_LIVE_MAX_IDENTIFIER_UTF8_BYTES)
const labelSchema = z
  .string()
  .min(1)
  .refine((value) => utf8ByteLength(value) <= TICKET_WORKSPACE_LIVE_MAX_LABEL_UTF8_BYTES)
const safeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const ticketKeySchema = identifierSchema.regex(/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/)
const repositoryIdSchema = identifierSchema.regex(/^[a-z0-9][a-z0-9._-]*$/)

const lifecycleValues = [
  'planned',
  'provisioning',
  'ready',
  'degraded',
  'dirty',
  'tearing-down',
  'removed'
] as const satisfies readonly TicketNavigatorSnapshotV1['tickets'][number]['lifecycle'][]
const roleValues = [
  'isolated',
  'referenced',
  'excluded'
] as const satisfies readonly TicketNavigatorSnapshotV1['tickets'][number]['workspaces'][number]['role'][]
const actualStateValues = [
  'absent',
  'provisioning',
  'ready',
  'removing',
  'degraded',
  'dirty'
] as const satisfies readonly TicketNavigatorSnapshotV1['tickets'][number]['workspaces'][number]['actualState'][]

const sourceIdentitySchema = z
  .object({
    authorityId: identifierSchema,
    ledgerEpoch: identifierSchema,
    ledgerRevision: safeIntegerSchema,
    projectionSequence: safeIntegerSchema,
    catalogDigest: digestSchema
  })
  .strict()
  .readonly()

const workspaceSchema = z
  .object({
    repositoryId: repositoryIdSchema,
    label: labelSchema,
    role: z.enum(roleValues),
    actualState: z.enum(actualStateValues)
  })
  .strict()
  .readonly()

const ticketSchema = z
  .object({
    ticketKey: ticketKeySchema,
    label: labelSchema,
    lifecycle: z.enum(lifecycleValues),
    availability: z.enum(['available', 'unavailable']),
    workspaces: z.array(workspaceSchema).max(TICKET_WORKSPACE_LIVE_MAX_WORKSPACES).readonly()
  })
  .strict()
  .readonly()

const ticketsSchema = z
  .array(ticketSchema)
  .max(TICKET_WORKSPACE_LIVE_MAX_TICKETS)
  .superRefine((tickets, context) => {
    const uniqueTickets = new Set(tickets.map((ticket) => ticket.ticketKey)).size === tickets.length
    const workspaces = tickets.reduce((count, ticket) => count + ticket.workspaces.length, 0)
    const uniqueRepositories = tickets.every(
      (ticket) =>
        new Set(ticket.workspaces.map((workspace) => workspace.repositoryId)).size ===
        ticket.workspaces.length
    )
    if (!uniqueTickets || !uniqueRepositories) {
      context.addIssue({ code: 'custom', message: 'Duplicate ticket or repository' })
    }
    if (workspaces > TICKET_WORKSPACE_LIVE_MAX_WORKSPACES) {
      context.addIssue({ code: 'custom', message: 'Aggregate workspace limit exceeded' })
    }
  })
  .readonly()

const presentationRequestSchema = z.object({ requestId: requestIdSchema }).strict().readonly()
const selectionShape = {
  requestId: requestIdSchema,
  receiptId: requestIdSchema,
  snapshotRevision: digestSchema,
  sourceIdentity: sourceIdentitySchema,
  ticketKey: ticketKeySchema,
  repositoryId: repositoryIdSchema
}
const selectionRequestSchema = z.object(selectionShape).strict().readonly()

const currentPresentationSchema = z
  .object({
    status: z.literal('current'),
    requestId: requestIdSchema,
    receiptId: requestIdSchema,
    snapshotRevision: digestSchema,
    sourceIdentity: sourceIdentitySchema,
    currentnessRemainingMs: z.number().int().min(1).max(TICKET_WORKSPACE_LIVE_MAX_CURRENTNESS_MS),
    tickets: ticketsSchema
  })
  .strict()
  .readonly()
const stalePresentationSchema = z
  .object({
    status: z.literal('stale'),
    requestId: requestIdSchema,
    receiptId: requestIdSchema,
    snapshotRevision: digestSchema,
    sourceIdentity: sourceIdentitySchema,
    tickets: ticketsSchema
  })
  .strict()
  .readonly()
const emptyPresentationSchema = z
  .object({
    status: z.enum(['unavailable', 'unsupported']),
    requestId: requestIdSchema
  })
  .strict()
  .readonly()
const presentationResponseSchema = z.discriminatedUnion('status', [
  currentPresentationSchema,
  stalePresentationSchema,
  emptyPresentationSchema
])

const matchResponseSchema = z
  .object({
    ...selectionShape,
    status: z.enum(['matched', 'unavailable', 'unsupported'])
  })
  .strict()
  .readonly()
const unavailableRebindSchema = z
  .object({ ...selectionShape, status: z.enum(['unavailable', 'unsupported']) })
  .strict()
  .readonly()
const reboundResponseSchema = z
  .object({
    ...selectionShape,
    status: z.literal('rebound'),
    worktreeId: z.string().min(1).max(32_767)
  })
  .strict()
  .readonly()
const rebindResponseSchema = z.discriminatedUnion('status', [
  reboundResponseSchema,
  unavailableRebindSchema
])

export type TicketWorkspaceLiveSourceIdentity = z.infer<typeof sourceIdentitySchema>
export type TicketWorkspaceLiveWorkspace = z.infer<typeof workspaceSchema>
export type TicketWorkspaceLiveTicket = z.infer<typeof ticketSchema>
export type TicketWorkspaceLivePresentationRequest = z.infer<typeof presentationRequestSchema>
export type TicketWorkspaceLiveSelectionRequest = z.infer<typeof selectionRequestSchema>
export type TicketWorkspaceLivePresentationResponse = z.infer<typeof presentationResponseSchema>
export type TicketWorkspaceLiveMatchResponse = z.infer<typeof matchResponseSchema>
export type TicketWorkspaceLiveRebindResponse = z.infer<typeof rebindResponseSchema>
export type TicketWorkspaceLiveApi = Readonly<{
  getPresentation(
    request: TicketWorkspaceLivePresentationRequest
  ): Promise<TicketWorkspaceLivePresentationResponse>
  matchSelection(
    request: TicketWorkspaceLiveSelectionRequest
  ): Promise<TicketWorkspaceLiveMatchResponse>
  rebindSelectionAtClick(
    request: TicketWorkspaceLiveSelectionRequest
  ): Promise<TicketWorkspaceLiveRebindResponse>
}>

export function parseTicketWorkspaceLivePresentationRequest(
  value: unknown
): TicketWorkspaceLivePresentationRequest | null {
  return parse(presentationRequestSchema, value, hasExactPresentationRequestShape)
}

export function parseTicketWorkspaceLiveSelectionRequest(
  value: unknown
): TicketWorkspaceLiveSelectionRequest | null {
  return parse(selectionRequestSchema, value, hasExactSelectionRequestShape)
}

export function validateTicketWorkspaceLivePresentationResponse(
  value: unknown,
  request: TicketWorkspaceLivePresentationRequest
): TicketWorkspaceLivePresentationResponse | null {
  const validRequest = parseTicketWorkspaceLivePresentationRequest(request)
  const response = parse(presentationResponseSchema, value, hasExactPresentationResponseShape)
  return validRequest && response?.requestId === validRequest.requestId ? response : null
}

export function validateTicketWorkspaceLiveMatchResponse(
  value: unknown,
  request: TicketWorkspaceLiveSelectionRequest
): TicketWorkspaceLiveMatchResponse | null {
  const validRequest = parseTicketWorkspaceLiveSelectionRequest(request)
  const response = parse(matchResponseSchema, value, hasExactMatchResponseShape)
  return validRequest && response && sameSelection(response, validRequest) ? response : null
}

export function validateTicketWorkspaceLiveRebindResponse(
  value: unknown,
  request: TicketWorkspaceLiveSelectionRequest
): TicketWorkspaceLiveRebindResponse | null {
  const validRequest = parseTicketWorkspaceLiveSelectionRequest(request)
  const response = parse(rebindResponseSchema, value, hasExactRebindResponseShape)
  if (!validRequest || !response || !sameSelection(response, validRequest)) {
    return null
  }
  return response.status === 'rebound' &&
    !isBoundedOrcaWorktreeId(response.worktreeId, validRequest.repositoryId)
    ? null
    : response
}

function parse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  hasExactShape: (candidate: unknown) => boolean
): T | null {
  try {
    if (!hasExactShape(value)) {
      return null
    }
    const result = schema.safeParse(value)
    return result.success && isWithinEnvelopeLimit(result.data) ? result.data : null
  } catch {
    return null
  }
}

function sameSelection(
  left: TicketWorkspaceLiveSelectionRequest,
  right: TicketWorkspaceLiveSelectionRequest
): boolean {
  return (
    left.requestId === right.requestId &&
    left.receiptId === right.receiptId &&
    left.snapshotRevision === right.snapshotRevision &&
    left.sourceIdentity.authorityId === right.sourceIdentity.authorityId &&
    left.sourceIdentity.ledgerEpoch === right.sourceIdentity.ledgerEpoch &&
    left.sourceIdentity.ledgerRevision === right.sourceIdentity.ledgerRevision &&
    left.sourceIdentity.projectionSequence === right.sourceIdentity.projectionSequence &&
    left.sourceIdentity.catalogDigest === right.sourceIdentity.catalogDigest &&
    left.ticketKey === right.ticketKey &&
    left.repositoryId === right.repositoryId
  )
}

function isWithinEnvelopeLimit(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value)
    return (
      serialized !== undefined &&
      new TextEncoder().encode(serialized).byteLength <= TICKET_WORKSPACE_LIVE_MAX_UTF8_BYTES
    )
  } catch {
    return false
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isCanonicalRequestId(value: string): boolean {
  if (!/^[A-Za-z0-9_-]{22}$/.test(value)) {
    return false
  }
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(`${base64}==`)
    const canonical = btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return decoded.length === 16 && canonical === value
  } catch {
    return false
  }
}
