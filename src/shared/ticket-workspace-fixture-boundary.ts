import type {
  TicketNavigatorSnapshotV1,
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1' with {
  'resolution-mode': 'import'
}

export type TicketWorkspaceFixtureContract = {
  parseTicketNavigatorSnapshotUtf8V1: typeof parseTicketNavigatorSnapshotUtf8V1
  serializeTicketNavigatorSnapshotUtf8V1: typeof serializeTicketNavigatorSnapshotUtf8V1
  maxUtf8Bytes: number
}

export const TICKET_WORKSPACE_FIXTURE_CHANNEL = 'ticketWorkspace:getFixtureSnapshot'
export const TICKET_WORKSPACE_FIXTURE_CASE_ID = 'accepted-full-snapshot'
export const TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION =
  'b1b804774798880bb2614d6c7a9b62416d7831f544b64acf31c6f981b64a4f67'

const CONTRACT_VERSION = 1
const ARTIFACT_DIGEST = '630cb8fb3fe577d528614ec0c9cd8e9c1bc6264afb45f53ee0101fee92b28cd4'
const CONTRACT_SOURCE_COMMIT = 'd27fe24e5cead1fae9ba86ac7b57ac5decf067d9'
const SNAPSHOT_CORPUS_SHA256 = '392aa7bb8f25378325b0c82c4698eaa07beb59c8f6e5bf3b9203bbe1730ae7e4'
const RESPONSE_KEYS = ['artifactDigest', 'contractVersion', 'payloadUtf8', 'provenance']
const PROVENANCE_KEYS = [
  'kind',
  'payloadUtf8Bytes',
  'snapshotCaseId',
  'snapshotCorpusSha256',
  'snapshotRevision',
  'ticketWorkspaceContractCommit'
]
export type TicketWorkspaceFixtureWorkspace = {
  repositoryId: string
  label: string
  role: TicketNavigatorSnapshotV1['tickets'][number]['workspaces'][number]['role']
  actualState: TicketNavigatorSnapshotV1['tickets'][number]['workspaces'][number]['actualState']
  branch?: string
}

export type TicketWorkspaceFixtureTicket = {
  ticketKey: string
  label: string
  lifecycle: TicketNavigatorSnapshotV1['tickets'][number]['lifecycle']
  availability: TicketNavigatorSnapshotV1['tickets'][number]['availability']
  coordinatorTargetDeclared: boolean
  workspaces: TicketWorkspaceFixtureWorkspace[]
}

export type TicketWorkspaceFixturePresentation =
  | {
      status: 'fixture'
      provenance: {
        kind: 'fixture'
        snapshotCaseId: string
        snapshotRevision: string
      }
      orcaMatch: { status: 'not-evaluated' }
      tickets: TicketWorkspaceFixtureTicket[]
    }
  | {
      status: 'unavailable'
      scope: 'tickets-only'
      provenance: { kind: 'fixture' }
      orcaMatch: { status: 'not-evaluated' }
    }

export type TicketWorkspaceFixtureWireResponse =
  | {
      contractVersion: 1
      artifactDigest: string
      provenance: {
        kind: 'fixture'
        ticketWorkspaceContractCommit: string
        snapshotCorpusSha256: string
        snapshotCaseId: string
        snapshotRevision: string
        payloadUtf8Bytes: number
      }
      payloadUtf8: string
    }
  | {
      status: 'unavailable'
      contractVersion: 1
      artifactDigest: string
      reason: 'boundary_response_invalid'
      retryable: false
      scope: 'tickets-only'
      diagnostic?: string
    }

export function createTicketWorkspaceFixtureWireResponse(
  snapshot: TicketNavigatorSnapshotV1,
  contract: TicketWorkspaceFixtureContract
): TicketWorkspaceFixtureWireResponse {
  const payloadUtf8 = contract.serializeTicketNavigatorSnapshotUtf8V1(snapshot)
  const payloadUtf8Bytes = new TextEncoder().encode(payloadUtf8).byteLength
  if (
    payloadUtf8Bytes > contract.maxUtf8Bytes ||
    snapshot.snapshotRevision !== TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION
  ) {
    return unavailableTicketWorkspaceFixtureWireResponse()
  }
  return {
    contractVersion: CONTRACT_VERSION,
    artifactDigest: ARTIFACT_DIGEST,
    provenance: {
      kind: 'fixture',
      ticketWorkspaceContractCommit: CONTRACT_SOURCE_COMMIT,
      snapshotCorpusSha256: SNAPSHOT_CORPUS_SHA256,
      snapshotCaseId: TICKET_WORKSPACE_FIXTURE_CASE_ID,
      snapshotRevision: snapshot.snapshotRevision,
      payloadUtf8Bytes
    },
    payloadUtf8
  }
}

export function unavailableTicketWorkspaceFixtureWireResponse(): TicketWorkspaceFixtureWireResponse {
  return {
    status: 'unavailable',
    contractVersion: CONTRACT_VERSION,
    artifactDigest: ARTIFACT_DIGEST,
    reason: 'boundary_response_invalid',
    retryable: false,
    scope: 'tickets-only'
  }
}

export function projectTicketWorkspaceFixtureResponse(
  response: unknown,
  contract: TicketWorkspaceFixtureContract
): TicketWorkspaceFixturePresentation {
  try {
    if (isRecord(response) && response.status === 'unavailable') {
      return unavailableTicketWorkspaceFixturePresentation()
    }
    if (!hasExactKeys(response, RESPONSE_KEYS)) {
      return unavailableTicketWorkspaceFixturePresentation()
    }
    if (
      response.contractVersion !== CONTRACT_VERSION ||
      response.artifactDigest !== ARTIFACT_DIGEST ||
      typeof response.payloadUtf8 !== 'string' ||
      response.payloadUtf8.length > contract.maxUtf8Bytes ||
      !hasExactKeys(response.provenance, PROVENANCE_KEYS)
    ) {
      return unavailableTicketWorkspaceFixturePresentation()
    }
    const provenance = response.provenance
    if (
      provenance.kind !== 'fixture' ||
      provenance.ticketWorkspaceContractCommit !== CONTRACT_SOURCE_COMMIT ||
      provenance.snapshotCorpusSha256 !== SNAPSHOT_CORPUS_SHA256 ||
      typeof provenance.snapshotCaseId !== 'string' ||
      typeof provenance.snapshotRevision !== 'string' ||
      !Number.isSafeInteger(provenance.payloadUtf8Bytes)
    ) {
      return unavailableTicketWorkspaceFixturePresentation()
    }
    const payloadUtf8Bytes = new TextEncoder().encode(response.payloadUtf8).byteLength
    if (
      payloadUtf8Bytes > contract.maxUtf8Bytes ||
      payloadUtf8Bytes !== provenance.payloadUtf8Bytes
    ) {
      return unavailableTicketWorkspaceFixturePresentation()
    }
    const parsed = contract.parseTicketNavigatorSnapshotUtf8V1(response.payloadUtf8)
    if (
      parsed.schemaVerdict !== 'accepted' ||
      provenance.snapshotCaseId !== TICKET_WORKSPACE_FIXTURE_CASE_ID ||
      provenance.snapshotRevision !== TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION ||
      parsed.value.snapshotRevision !== provenance.snapshotRevision ||
      contract.serializeTicketNavigatorSnapshotUtf8V1(parsed.value) !== response.payloadUtf8
    ) {
      return unavailableTicketWorkspaceFixturePresentation()
    }
    return projectValidatedTicketWorkspaceFixture(parsed.value, contract.maxUtf8Bytes)
  } catch {
    return unavailableTicketWorkspaceFixturePresentation()
  }
}

export function unavailableTicketWorkspaceFixturePresentation(): TicketWorkspaceFixturePresentation {
  return {
    status: 'unavailable',
    scope: 'tickets-only',
    provenance: { kind: 'fixture' },
    orcaMatch: { status: 'not-evaluated' }
  }
}

function projectValidatedTicketWorkspaceFixture(
  snapshot: TicketNavigatorSnapshotV1,
  maxUtf8Bytes: number
): TicketWorkspaceFixturePresentation {
  const tickets: TicketWorkspaceFixtureTicket[] = snapshot.tickets.map((ticket) => ({
    ticketKey: ticket.ticketKey,
    label: ticket.label,
    lifecycle: ticket.lifecycle,
    availability: ticket.availability,
    coordinatorTargetDeclared: ticket.coordinatorTarget !== undefined,
    workspaces: ticket.workspaces.map((workspace) => ({
      repositoryId: workspace.repositoryId,
      label: workspace.label,
      role: workspace.role,
      actualState: workspace.actualState,
      ...(workspace.branch === undefined ? {} : { branch: workspace.branch })
    }))
  }))
  const presentation: TicketWorkspaceFixturePresentation = {
    status: 'fixture',
    provenance: {
      kind: 'fixture',
      snapshotCaseId: TICKET_WORKSPACE_FIXTURE_CASE_ID,
      snapshotRevision: snapshot.snapshotRevision
    },
    orcaMatch: { status: 'not-evaluated' },
    tickets
  }
  if (new TextEncoder().encode(JSON.stringify(presentation)).byteLength > maxUtf8Bytes) {
    return unavailableTicketWorkspaceFixturePresentation()
  }
  return presentation
}

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[]
): value is Record<string, unknown> {
  return (
    isRecord(value) && Object.keys(value).sort().join('\0') === [...expectedKeys].sort().join('\0')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
