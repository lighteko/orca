import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  TICKET_RESIDENT_CONTROL_MAX_BYTES,
  TICKET_RESIDENT_FRAME_MAX_BYTES,
  TICKET_RESIDENT_TAG_BYTES,
  type TicketResidentDirection,
  type TicketResidentFrameContext,
  isRecord
} from './ticket-workspace-resident-protocol'
import { ticketResidentCanonicalJson } from './ticket-workspace-resident-canonical'

const FRAME_DOMAIN = Buffer.from('ticket.navigator.resident.v1/frame', 'utf8')
const MAX_SEQUENCE = 0xffff_ffff_ffff_ffffn
export function encodeTicketResidentProtectedFrame(
  message: object,
  direction: TicketResidentDirection,
  sequence: bigint,
  key: Buffer,
  context: TicketResidentFrameContext
): Buffer {
  if (sequence < 0n || sequence > MAX_SEQUENCE) {
    throw new Error('Frame sequence exhausted')
  }
  const body = Buffer.from(ticketResidentCanonicalJson(message), 'utf8')
  const isChunk = isRecord(message) && message.type === 'snapshot.chunk'
  const bodyLimit = isChunk ? TICKET_RESIDENT_FRAME_MAX_BYTES : TICKET_RESIDENT_CONTROL_MAX_BYTES
  if (body.byteLength === 0 || body.byteLength > bodyLimit) {
    throw new Error('Protected frame exceeds its body limit')
  }
  const tag = hmac(key, ticketResidentFrameMacInput(direction, sequence, body, context))
  return Buffer.concat([frameWithPrefix(body), tag])
}

export function verifyTicketResidentProtectedFrameTag(
  direction: TicketResidentDirection,
  sequence: bigint,
  body: Buffer,
  tag: Buffer,
  key: Buffer,
  context: TicketResidentFrameContext
): boolean {
  if (tag.byteLength !== TICKET_RESIDENT_TAG_BYTES) {
    return false
  }
  const expected = hmac(key, ticketResidentFrameMacInput(direction, sequence, body, context))
  return timingSafeEqual(expected, tag)
}

export function ticketResidentFrameMacInput(
  direction: TicketResidentDirection,
  sequence: bigint,
  body: Buffer,
  context: TicketResidentFrameContext
): Buffer {
  if (sequence < 0n || sequence > MAX_SEQUENCE || context.transcriptHash.byteLength !== 32) {
    throw new Error('Invalid protected frame context')
  }
  const sessionId = Buffer.from(context.sessionId, 'utf8')
  const connectionIncarnation = Buffer.from(context.connectionIncarnation, 'utf8')
  const sequenceBytes = Buffer.alloc(8)
  sequenceBytes.writeBigUInt64BE(sequence)
  const lengthBytes = Buffer.alloc(4)
  lengthBytes.writeUInt32BE(body.byteLength)
  return Buffer.concat([
    FRAME_DOMAIN,
    Buffer.from([0]),
    context.transcriptHash,
    Buffer.from([direction === 'c2s' ? 0 : 1]),
    sessionId,
    Buffer.from([0]),
    connectionIncarnation,
    Buffer.from([0]),
    sequenceBytes,
    lengthBytes,
    body
  ])
}

function hmac(key: Buffer, input: Buffer): Buffer {
  return createHmac('sha256', key).update(input).digest()
}

function frameWithPrefix(body: Buffer): Buffer {
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(body.byteLength)
  return Buffer.concat([prefix, body])
}
