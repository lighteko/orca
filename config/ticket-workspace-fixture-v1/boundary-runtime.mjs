import {
  TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1,
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  validateTicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'

const RESPONSE_KEYS = [
  'artifactDigest',
  'contractVersion',
  'payloadUtf8',
  'provenance'
]
const PROVENANCE_KEYS = [
  'kind',
  'payloadUtf8Bytes',
  'snapshotCaseId',
  'snapshotRevision',
  'snapshotCorpusSha256',
  'ticketWorkspaceContractCommit'
]
const UNAVAILABLE_REQUIRED_KEYS = [
  'artifactDigest',
  'contractVersion',
  'reason',
  'retryable',
  'scope',
  'status'
]
const FIXTURE_DIAGNOSTIC_MAX_UTF8_BYTES = 4096

export function makeFixtureResponse(snapshot, provenance, artifactDigest) {
  const validation = validateTicketNavigatorSnapshotV1(snapshot)
  if (validation.schemaVerdict !== 'accepted') {
    return unavailable()
  }
  const payloadUtf8 = serializeTicketNavigatorSnapshotUtf8V1(validation.value)
  return {
    contractVersion: 1,
    artifactDigest,
    provenance: {
      kind: 'fixture',
      ticketWorkspaceContractCommit: provenance.ticketWorkspaceContractCommit,
      snapshotCorpusSha256: provenance.snapshotCorpusSha256,
      snapshotCaseId: provenance.snapshotCaseId,
      snapshotRevision: validation.value.snapshotRevision,
      payloadUtf8Bytes: new TextEncoder().encode(payloadUtf8).byteLength
    },
    payloadUtf8
  }
}

export function validateFixtureResponse(response, expected) {
  if (isRecord(response) && response.status === 'unavailable') {
    validateFixtureUnavailableEnvelope(response, expected)
    return unavailable()
  }
  if (!hasExactKeys(response, RESPONSE_KEYS)) return unavailable()
  if (response.contractVersion !== 1 || response.artifactDigest !== expected.artifactDigest) {
    return unavailable()
  }
  if (!hasExactKeys(response.provenance, PROVENANCE_KEYS)) return unavailable()
  const provenance = response.provenance
  if (
    provenance.kind !== 'fixture' ||
    provenance.ticketWorkspaceContractCommit !== expected.ticketWorkspaceContractCommit ||
    provenance.snapshotCorpusSha256 !== expected.snapshotCorpusSha256 ||
    !expected.snapshotCaseIds.includes(provenance.snapshotCaseId) ||
    typeof provenance.snapshotRevision !== 'string' ||
    !Number.isSafeInteger(provenance.payloadUtf8Bytes) ||
    typeof response.payloadUtf8 !== 'string'
  ) {
    return unavailable()
  }
  const payloadBytes = new TextEncoder().encode(response.payloadUtf8).byteLength
  if (
    payloadBytes > TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1 ||
    payloadBytes !== provenance.payloadUtf8Bytes
  ) {
    return unavailable()
  }
  const parsed = parseTicketNavigatorSnapshotUtf8V1(response.payloadUtf8)
  if (parsed.schemaVerdict !== 'accepted') return unavailable()
  if (
    parsed.value.snapshotRevision !== provenance.snapshotRevision ||
    parsed.value.snapshotRevision !== expected.snapshotRevisionByCaseId[provenance.snapshotCaseId] ||
    serializeTicketNavigatorSnapshotUtf8V1(parsed.value) !== response.payloadUtf8
  ) {
    return unavailable()
  }
  return {
    status: 'fixture',
    provenance: {
      kind: 'fixture',
      snapshotCaseId: provenance.snapshotCaseId,
      snapshotRevision: parsed.value.snapshotRevision
    },
    orcaMatch: { status: 'not-evaluated' }
  }
}

export function decodeFixtureBytes(bytes, expectedEnvelope, expected) {
  const byteLength = getByteLength(bytes)
  if (byteLength === undefined || byteLength > TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1) {
    return unavailable()
  }
  let payloadUtf8
  try {
    const byteView = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
    if (byteView.byteLength !== byteLength) return unavailable()
    payloadUtf8 = new TextDecoder('utf-8', { fatal: true }).decode(byteView)
  } catch {
    return unavailable()
  }
  return validateFixtureResponse({ ...expectedEnvelope, payloadUtf8 }, expected)
}

export function validateFixtureUnavailableEnvelope(response, expected) {
  if (!hasExactKeysWithOptional(response, UNAVAILABLE_REQUIRED_KEYS, ['diagnostic'])) return false
  if (
    response.status !== 'unavailable' ||
    response.contractVersion !== 1 ||
    response.artifactDigest !== expected.artifactDigest ||
    response.scope !== 'tickets-only' ||
    response.reason !== 'boundary_response_invalid' ||
    response.retryable !== false
  ) {
    return false
  }
  if (Object.hasOwn(response, 'diagnostic')) {
    if (typeof response.diagnostic !== 'string') return false
    if (new TextEncoder().encode(response.diagnostic).byteLength > FIXTURE_DIAGNOSTIC_MAX_UTF8_BYTES) {
      return false
    }
  }
  return true
}

export function makeMainRequest(rendererArguments) {
  if (!Array.isArray(rendererArguments) || rendererArguments.length !== 0) {
    return { accepted: false }
  }
  return { accepted: true, request: { contractVersion: 1 } }
}

export function unavailable() {
  return {
    status: 'unavailable',
    scope: 'tickets-only',
    provenance: { kind: 'fixture' },
    orcaMatch: { status: 'not-evaluated' }
  }
}

function hasExactKeys(value, expectedKeys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...expectedKeys].sort().join('\0')
  )
}

function hasExactKeysWithOptional(value, requiredKeys, optionalKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).sort()
  const required = [...requiredKeys].sort()
  if (required.some((key) => !keys.includes(key))) return false
  return keys.every((key) => required.includes(key) || optionalKeys.includes(key))
}

function getByteLength(bytes) {
  if (bytes instanceof Uint8Array) return bytes.byteLength
  if (!Array.isArray(bytes) || bytes.length > TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1) return undefined
  if (!bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return undefined
  return bytes.length
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
