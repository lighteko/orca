import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import {
  TICKET_RESIDENT_CAPABILITIES,
  TICKET_RESIDENT_HELLO_MAX_BYTES,
  TICKET_RESIDENT_PROTOCOL_ID,
  TICKET_RESIDENT_PROTOCOL_VERSION,
  type TicketResidentBinding,
  type TicketResidentClientHandshake,
  type TicketResidentClientHello,
  type TicketResidentClientFinish,
  type TicketResidentServerHello,
  type TicketResidentFrameContext,
  validateTicketResidentBinding,
  isRecord
} from './ticket-workspace-resident-protocol'
import { ticketResidentCanonicalJson } from './ticket-workspace-resident-canonical'

const CLIENT_HELLO_DOMAIN = 'ticket.navigator.resident.v1/clientHello'
const SERVER_HELLO_DOMAIN = 'ticket.navigator.resident.v1/serverHello'
const CLIENT_FINISH_DOMAIN = 'ticket.navigator.resident.v1/clientFinish'
export function createTicketResidentClientHello(
  setupKey: Buffer,
  binding: TicketResidentBinding,
  randomBytes: (size: number) => Buffer
): TicketResidentClientHello {
  requireSetupKey(setupKey)
  requireBinding(binding)
  const clientHelloWithoutProof = {
    type: 'clientHello' as const,
    protocolId: TICKET_RESIDENT_PROTOCOL_ID,
    protocolVersion: TICKET_RESIDENT_PROTOCOL_VERSION,
    sessionId: encodeBase64Url(randomBytes(16), 16),
    clientNonce: encodeBase64Url(randomBytes(32), 32),
    binding,
    capabilities: TICKET_RESIDENT_CAPABILITIES
  }
  const proof = encodeBase64Url(
    hmac(
      setupKey,
      canonicalUtf8({ domain: CLIENT_HELLO_DOMAIN, clientHello: clientHelloWithoutProof })
    ),
    32
  )
  return { ...clientHelloWithoutProof, proof }
}

export function verifyTicketResidentServerHello(
  setupKey: Buffer,
  expectedBinding: TicketResidentBinding,
  clientHello: TicketResidentClientHello,
  value: unknown
): TicketResidentClientHandshake {
  requireSetupKey(setupKey)
  requireBinding(expectedBinding)
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'type',
      'protocolId',
      'protocolVersion',
      'sessionId',
      'clientNonce',
      'serverNonce',
      'connectionIncarnation',
      'binding',
      'capabilities',
      'proof'
    ])
  ) {
    throw new Error('Invalid server hello shape')
  }
  if (
    value.type !== 'serverHello' ||
    value.protocolId !== TICKET_RESIDENT_PROTOCOL_ID ||
    value.protocolVersion !== TICKET_RESIDENT_PROTOCOL_VERSION ||
    !base64UrlOfSize(value.sessionId, 16) ||
    !base64UrlOfSize(value.clientNonce, 32) ||
    !base64UrlOfSize(value.serverNonce, 32) ||
    !base64UrlOfSize(value.connectionIncarnation, 16) ||
    !validateTicketResidentBinding(value.binding) ||
    !sameCanonical(value.binding, expectedBinding) ||
    value.sessionId !== clientHello.sessionId ||
    value.clientNonce !== clientHello.clientNonce ||
    !sameCapabilities(value.capabilities) ||
    !base64UrlOfSize(value.proof, 32)
  ) {
    throw new Error('Server hello binding mismatch')
  }

  const serverHelloWithoutProof = {
    type: 'serverHello' as const,
    protocolId: TICKET_RESIDENT_PROTOCOL_ID,
    protocolVersion: TICKET_RESIDENT_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    clientNonce: value.clientNonce,
    serverNonce: value.serverNonce,
    connectionIncarnation: value.connectionIncarnation,
    binding: value.binding,
    capabilities: TICKET_RESIDENT_CAPABILITIES
  }
  const serverProofInput = canonicalUtf8({
    domain: SERVER_HELLO_DOMAIN,
    clientHello: withoutProof(clientHello),
    clientProof: clientHello.proof,
    serverHello: serverHelloWithoutProof
  })
  if (!constantTimeBase64UrlEqual(value.proof, hmac(setupKey, serverProofInput))) {
    throw new Error('Invalid server proof')
  }

  const clientFinishWithoutProof = {
    type: 'clientFinish' as const,
    protocolId: TICKET_RESIDENT_PROTOCOL_ID,
    protocolVersion: TICKET_RESIDENT_PROTOCOL_VERSION,
    sessionId: clientHello.sessionId,
    clientNonce: clientHello.clientNonce,
    serverNonce: value.serverNonce,
    connectionIncarnation: value.connectionIncarnation
  }
  const clientFinishProofInput = canonicalUtf8({
    domain: CLIENT_FINISH_DOMAIN,
    clientHello: withoutProof(clientHello),
    clientProof: clientHello.proof,
    serverHello: serverHelloWithoutProof,
    serverProof: value.proof,
    clientFinish: clientFinishWithoutProof
  })
  const clientFinish: TicketResidentClientFinish = {
    ...clientFinishWithoutProof,
    proof: encodeBase64Url(hmac(setupKey, clientFinishProofInput), 32)
  }
  const transcriptHash = createHashSha256(
    canonicalUtf8({
      clientHello: withoutProof(clientHello),
      clientProof: clientHello.proof,
      serverHello: serverHelloWithoutProof,
      serverProof: value.proof,
      clientFinish: clientFinishWithoutProof,
      clientFinishProof: clientFinish.proof
    })
  )
  const context: TicketResidentFrameContext = {
    transcriptHash,
    sessionId: clientHello.sessionId,
    connectionIncarnation: value.connectionIncarnation
  }
  const s2cKey = Buffer.from(
    hkdfSync(
      'sha256',
      setupKey,
      transcriptHash,
      Buffer.from('ticket.navigator.resident.v1/frame/s2c', 'utf8'),
      32
    )
  )
  const c2sKey = Buffer.from(
    hkdfSync(
      'sha256',
      setupKey,
      transcriptHash,
      Buffer.from('ticket.navigator.resident.v1/frame/c2s', 'utf8'),
      32
    )
  )
  const serverHello: TicketResidentServerHello = {
    ...serverHelloWithoutProof,
    proof: value.proof
  }
  return { clientHello, clientFinish, serverHello, context, c2sKey, s2cKey }
}

export function encodeTicketResidentHelloFrame(message: object): Buffer {
  const body = canonicalUtf8(message)
  if (body.byteLength === 0 || body.byteLength > TICKET_RESIDENT_HELLO_MAX_BYTES) {
    throw new Error('Hello frame exceeds its body limit')
  }
  return frameWithPrefix(body)
}

export function constantTimeBase64UrlEqual(value: string, expected: Buffer): boolean {
  if (!base64UrlOfSize(value, expected.byteLength)) {
    return false
  }
  const observed = decodeBase64Url(value)
  return observed.byteLength === expected.byteLength && timingSafeEqual(observed, expected)
}

function requireBinding(value: unknown): asserts value is TicketResidentBinding {
  if (!validateTicketResidentBinding(value)) {
    throw new Error('Invalid expected binding')
  }
}

function requireSetupKey(setupKey: Buffer): void {
  if (!Buffer.isBuffer(setupKey) || setupKey.byteLength !== 32) {
    throw new Error('Setup key must be exactly 32 bytes')
  }
}

function withoutProof<T extends { proof: string }>(message: T): Omit<T, 'proof'> {
  const { proof, ...without } = message
  void proof
  return without
}

function canonicalUtf8(value: unknown): Buffer {
  return Buffer.from(ticketResidentCanonicalJson(value), 'utf8')
}

function frameWithPrefix(body: Buffer): Buffer {
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(body.byteLength)
  return Buffer.concat([prefix, body])
}

function hmac(key: Buffer, input: Buffer): Buffer {
  return createHmac('sha256', key).update(input).digest()
}

function createHashSha256(input: Buffer): Buffer {
  return createHash('sha256').update(input).digest()
}

function encodeBase64Url(value: Buffer, expectedBytes: number): string {
  if (value.byteLength !== expectedBytes) {
    throw new Error('Random source returned the wrong number of bytes')
  }
  return value.toString('base64url')
}

function base64UrlOfSize(value: unknown, expectedBytes: number): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return false
  }
  const decoded = decodeBase64Url(value)
  return decoded.byteLength === expectedBytes && decoded.toString('base64url') === value
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return ticketResidentCanonicalJson(left) === ticketResidentCanonicalJson(right)
}

function sameCapabilities(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === TICKET_RESIDENT_CAPABILITIES.length &&
    TICKET_RESIDENT_CAPABILITIES.every((capability, index) => value[index] === capability)
  )
}

function exactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value)
  return (
    keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key))
  )
}
