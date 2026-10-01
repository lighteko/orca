import {
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1,
  type TicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  TICKET_RESIDENT_SNAPSHOT_MAX_BYTES,
  type TicketResidentBinding
} from './ticket-workspace-resident-protocol'

export type TicketWorkspaceResidentSnapshotAdmission =
  | { status: 'accepted'; snapshot: TicketNavigatorSnapshotV1 }
  | { status: 'unsupported' }
  | {
      status: 'rejected'
      reason:
        | 'byte_limit'
        | 'invalid_utf8'
        | 'invalid_snapshot'
        | 'noncanonical_bytes'
        | 'producer_mismatch'
        | 'binding_mismatch'
        | 'producer_policy'
        | 'timestamp_policy'
    }

export function admitTicketWorkspaceResidentSnapshot(
  snapshotBytes: Buffer,
  expectedBinding: TicketResidentBinding,
  boundLedgerEpoch: string
): TicketWorkspaceResidentSnapshotAdmission {
  if (
    snapshotBytes.byteLength >
    Math.min(TICKET_RESIDENT_SNAPSHOT_MAX_BYTES, TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1)
  ) {
    return { status: 'rejected', reason: 'byte_limit' }
  }

  let snapshotText: string
  try {
    snapshotText = new TextDecoder('utf-8', { fatal: true }).decode(snapshotBytes)
  } catch {
    return { status: 'rejected', reason: 'invalid_utf8' }
  }

  const parsed = parseTicketNavigatorSnapshotUtf8V1(snapshotText)
  if (parsed.schemaVerdict !== 'accepted') {
    return { status: 'rejected', reason: 'invalid_snapshot' }
  }
  const canonicalBytes = Buffer.from(serializeTicketNavigatorSnapshotUtf8V1(parsed.value), 'utf8')
  if (!canonicalBytes.equals(snapshotBytes)) {
    return { status: 'rejected', reason: 'noncanonical_bytes' }
  }

  const snapshot = parsed.value
  if (
    snapshot.producer.name !== 'ticket-workspace' ||
    snapshot.producer.version !== expectedBinding.expectedService.releaseId ||
    snapshot.producer.contractVersion !== 1
  ) {
    return { status: 'rejected', reason: 'producer_mismatch' }
  }
  if (
    !sameProfile(snapshot.profile, expectedBinding.profile) ||
    snapshot.source.authorityId !== expectedBinding.authorityId ||
    snapshot.source.ledgerEpoch !== boundLedgerEpoch
  ) {
    return { status: 'rejected', reason: 'binding_mismatch' }
  }
  if (
    snapshot.source.projectionSequence !== 0 ||
    snapshot.tickets.some(
      (ticket) =>
        ticket.actions.length > 0 ||
        ticket.workspaces.some(
          (workspace) => workspace.actions.length > 0 || workspace.referenceState === 'matched'
        )
    )
  ) {
    return { status: 'rejected', reason: 'producer_policy' }
  }
  if (!hasExactTimestampInterval(snapshot.generatedAt, snapshot.staleAfter)) {
    return { status: 'rejected', reason: 'timestamp_policy' }
  }
  if (
    snapshot.tickets.some(
      (ticket) =>
        ticket.availability === 'unsupported' ||
        ticket.coordinatorTarget?.executionHostId.startsWith('ssh:') === true ||
        ticket.workspaces.some(
          (workspace) =>
            workspace.referenceState === 'unsupported' ||
            workspace.target?.executionHostId.startsWith('ssh:') === true
        )
    )
  ) {
    return { status: 'unsupported' }
  }
  return { status: 'accepted', snapshot }
}

function sameProfile(
  actual: TicketNavigatorSnapshotV1['profile'],
  expected: TicketResidentBinding['profile']
): boolean {
  return (
    actual.profileId === expected.profileId &&
    actual.schemaVersion === expected.schemaVersion &&
    actual.profileVersion === expected.profileVersion
  )
}

function hasExactTimestampInterval(generatedAt: string, staleAfter: string): boolean {
  if (
    !isCanonicalUtcMillisecondTimestamp(generatedAt) ||
    !isCanonicalUtcMillisecondTimestamp(staleAfter)
  ) {
    return false
  }
  return Date.parse(staleAfter) - Date.parse(generatedAt) === 60_000
}

function isCanonicalUtcMillisecondTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}
