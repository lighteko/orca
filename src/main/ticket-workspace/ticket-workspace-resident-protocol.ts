export const TICKET_RESIDENT_PROTOCOL_ID = 'ticket.navigator.resident' as const
export const TICKET_RESIDENT_PROTOCOL_VERSION = 1 as const
export const TICKET_RESIDENT_HELLO_MAX_BYTES = 4_096
export const TICKET_RESIDENT_CONTROL_MAX_BYTES = 4_096
export const TICKET_RESIDENT_FRAME_MAX_BYTES = 24_576
export const TICKET_RESIDENT_TAG_BYTES = 32
export const TICKET_RESIDENT_SNAPSHOT_MAX_BYTES = 2_097_152
export const TICKET_RESIDENT_CHUNK_MAX_BYTES = 16_384
export const TICKET_RESIDENT_MAX_CHUNKS = 128

export const TICKET_RESIDENT_CAPABILITIES = [
  'no-start.v1',
  'snapshot.read.v1',
  'source.bind.v1'
] as const

const IDENTIFIER_MAX_UTF8_BYTES = 255

export type TicketResidentProfile = {
  profileId: string
  schemaVersion: 1
  profileVersion: string
}

export type TicketResidentBinding = {
  profile: TicketResidentProfile
  authorityId: string
  executionHost: { kind: 'wsl'; machineId: string; distro: string }
  expectedService: {
    producerName: 'ticket-workspace'
    releaseId: string
    artifactSha256: string
  }
}

export type TicketResidentClientHello = {
  type: 'clientHello'
  protocolId: typeof TICKET_RESIDENT_PROTOCOL_ID
  protocolVersion: 1
  sessionId: string
  clientNonce: string
  binding: TicketResidentBinding
  capabilities: typeof TICKET_RESIDENT_CAPABILITIES
  proof: string
}

export type TicketResidentServerHello = {
  type: 'serverHello'
  protocolId: typeof TICKET_RESIDENT_PROTOCOL_ID
  protocolVersion: 1
  sessionId: string
  clientNonce: string
  serverNonce: string
  connectionIncarnation: string
  binding: TicketResidentBinding
  capabilities: typeof TICKET_RESIDENT_CAPABILITIES
  proof: string
}

export type TicketResidentClientFinish = {
  type: 'clientFinish'
  protocolId: typeof TICKET_RESIDENT_PROTOCOL_ID
  protocolVersion: 1
  sessionId: string
  clientNonce: string
  serverNonce: string
  connectionIncarnation: string
  proof: string
}

export type TicketResidentWireErrorCode =
  | 'binding_mismatch'
  | 'authority_rebind_required'
  | 'source_unavailable'
  | 'snapshot_too_large'
  | 'deadline_exceeded'

export type TicketResidentServerMessage =
  | {
      type: 'source.bound'
      requestId: string
      authorityId: string
      ledgerEpoch: string
    }
  | { type: 'snapshot.begin'; requestId: string; snapshotBytes: number }
  | { type: 'snapshot.chunk'; requestId: string; index: number; bytes: string }
  | {
      type: 'snapshot.end'
      requestId: string
      byteCount: number
      chunkCount: number
    }
  | { type: 'cancelled'; requestId: string }
  | { type: 'error'; requestId: string; code: TicketResidentWireErrorCode }

export type TicketResidentDirection = 'c2s' | 's2c'

export type TicketResidentFrameContext = {
  transcriptHash: Buffer
  sessionId: string
  connectionIncarnation: string
}

export type TicketResidentClientHandshake = {
  clientHello: TicketResidentClientHello
  clientFinish: TicketResidentClientFinish
  serverHello: TicketResidentServerHello
  context: TicketResidentFrameContext
  c2sKey: Buffer
  s2cKey: Buffer
}

export function validateTicketResidentBinding(value: unknown): value is TicketResidentBinding {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['profile', 'authorityId', 'executionHost', 'expectedService'])
  ) {
    return false
  }
  const profile = value.profile
  const host = value.executionHost
  const service = value.expectedService
  return (
    isRecord(profile) &&
    exactKeys(profile, ['profileId', 'schemaVersion', 'profileVersion']) &&
    identifier(profile.profileId) &&
    profile.schemaVersion === 1 &&
    identifier(profile.profileVersion) &&
    identifier(value.authorityId) &&
    isRecord(host) &&
    exactKeys(host, ['kind', 'machineId', 'distro']) &&
    host.kind === 'wsl' &&
    identifier(host.machineId) &&
    identifier(host.distro) &&
    isRecord(service) &&
    exactKeys(service, ['producerName', 'releaseId', 'artifactSha256']) &&
    service.producerName === 'ticket-workspace' &&
    identifier(service.releaseId) &&
    typeof service.artifactSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(service.artifactSha256)
  )
}

export function parseTicketResidentServerMessage(value: unknown): TicketResidentServerMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Invalid protected message')
  }
  switch (value.type) {
    case 'source.bound':
      if (
        !exactKeys(value, ['type', 'requestId', 'authorityId', 'ledgerEpoch']) ||
        !base64UrlOfSize(value.requestId, 16) ||
        !identifier(value.authorityId) ||
        !identifier(value.ledgerEpoch)
      ) {
        throw new Error('Invalid source.bound message')
      }
      return {
        type: 'source.bound',
        requestId: value.requestId,
        authorityId: value.authorityId,
        ledgerEpoch: value.ledgerEpoch
      }
    case 'snapshot.begin':
      if (
        !exactKeys(value, ['type', 'requestId', 'snapshotBytes']) ||
        !base64UrlOfSize(value.requestId, 16) ||
        !integerInRange(value.snapshotBytes, 1, TICKET_RESIDENT_SNAPSHOT_MAX_BYTES)
      ) {
        throw new Error('Invalid snapshot.begin message')
      }
      return {
        type: 'snapshot.begin',
        requestId: value.requestId,
        snapshotBytes: value.snapshotBytes
      }
    case 'snapshot.chunk':
      if (
        !exactKeys(value, ['type', 'requestId', 'index', 'bytes']) ||
        !base64UrlOfSize(value.requestId, 16) ||
        !integerInRange(value.index, 0, TICKET_RESIDENT_MAX_CHUNKS - 1) ||
        typeof value.bytes !== 'string'
      ) {
        throw new Error('Invalid snapshot.chunk message')
      }
      const chunk = decodeBase64Url(value.bytes)
      if (
        chunk.byteLength === 0 ||
        chunk.byteLength > TICKET_RESIDENT_CHUNK_MAX_BYTES ||
        chunk.toString('base64url') !== value.bytes
      ) {
        throw new Error('Invalid snapshot.chunk bytes')
      }
      return {
        type: 'snapshot.chunk',
        requestId: value.requestId,
        index: value.index,
        bytes: value.bytes
      }
    case 'snapshot.end':
      if (
        !exactKeys(value, ['type', 'requestId', 'byteCount', 'chunkCount']) ||
        !base64UrlOfSize(value.requestId, 16) ||
        !integerInRange(value.byteCount, 1, TICKET_RESIDENT_SNAPSHOT_MAX_BYTES) ||
        !integerInRange(value.chunkCount, 1, TICKET_RESIDENT_MAX_CHUNKS)
      ) {
        throw new Error('Invalid snapshot.end message')
      }
      return {
        type: 'snapshot.end',
        requestId: value.requestId,
        byteCount: value.byteCount,
        chunkCount: value.chunkCount
      }
    case 'cancelled':
      if (!exactKeys(value, ['type', 'requestId']) || !base64UrlOfSize(value.requestId, 16)) {
        throw new Error('Invalid cancelled message')
      }
      return { type: 'cancelled', requestId: value.requestId }
    case 'error':
      if (
        !exactKeys(value, ['type', 'requestId', 'code']) ||
        !base64UrlOfSize(value.requestId, 16) ||
        !isWireErrorCode(value.code)
      ) {
        throw new Error('Invalid error message')
      }
      return { type: 'error', requestId: value.requestId, code: value.code }
    default:
      throw new Error('Unknown protected message type')
  }
}

export function parseTicketResidentChunkBytes(
  message: Extract<TicketResidentServerMessage, { type: 'snapshot.chunk' }>
): Buffer {
  return decodeBase64Url(message.bytes)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    Buffer.byteLength(value, 'utf8') <= IDENTIFIER_MAX_UTF8_BYTES
  )
}

function base64UrlOfSize(value: unknown, expectedBytes: number): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return false
  }
  const decoded = Buffer.from(value, 'base64url')
  return decoded.byteLength === expectedBytes && decoded.toString('base64url') === value
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function exactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value)
  return (
    keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key))
  )
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  )
}

function isWireErrorCode(value: unknown): value is TicketResidentWireErrorCode {
  return (
    value === 'binding_mismatch' ||
    value === 'authority_rebind_required' ||
    value === 'source_unavailable' ||
    value === 'snapshot_too_large' ||
    value === 'deadline_exceeded'
  )
}
