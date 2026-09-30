import type { TicketResidentByteStream } from './ticket-workspace-resident-byte-stream'
import {
  TICKET_RESIDENT_CONTROL_MAX_BYTES,
  TICKET_RESIDENT_FRAME_MAX_BYTES,
  type TicketResidentClientHandshake,
  type TicketResidentServerMessage,
  isRecord,
  parseTicketResidentServerMessage
} from './ticket-workspace-resident-protocol'
import { parseTicketResidentCanonicalJson } from './ticket-workspace-resident-canonical'
import {
  encodeTicketResidentProtectedFrame,
  verifyTicketResidentProtectedFrameTag
} from './ticket-workspace-resident-frame-crypto'

const MAX_SEQUENCE = 0xffff_ffff_ffff_ffffn

export type TicketResidentReceivedMessage = {
  message: TicketResidentServerMessage
  deliveryBatchId: number
}

export class TicketResidentProtectedChannel {
  private handshake: TicketResidentClientHandshake | undefined
  private c2sSequence = 0n
  private s2cSequence = 0n

  constructor(
    private readonly stream: TicketResidentByteStream,
    private readonly now: () => number
  ) {}

  setHandshake(handshake: TicketResidentClientHandshake): void {
    this.handshake = handshake
  }

  async send(message: object, deadline: number): Promise<void> {
    const handshake = this.requireHandshake()
    if (this.c2sSequence > MAX_SEQUENCE) {
      throw new Error('Protected sequence exhausted')
    }
    const frame = encodeTicketResidentProtectedFrame(
      message,
      'c2s',
      this.c2sSequence,
      handshake.c2sKey,
      handshake.context
    )
    await this.stream.write(frame, deadline, this.now)
    this.c2sSequence += 1n
  }

  async receive(deadline: number): Promise<TicketResidentReceivedMessage> {
    const handshake = this.requireHandshake()
    const frame = await this.stream.readProtectedFrame(deadline, this.now)
    if (
      !frame.tag ||
      !verifyTicketResidentProtectedFrameTag(
        's2c',
        this.s2cSequence,
        frame.body,
        frame.tag,
        handshake.s2cKey,
        handshake.context
      )
    ) {
      throw new Error('Protected frame authentication failed')
    }
    if (this.s2cSequence > MAX_SEQUENCE) {
      throw new Error('Protected sequence exhausted')
    }
    this.s2cSequence += 1n
    const value = parseTicketResidentCanonicalJson(frame.body)
    if (!isRecord(value) || typeof value.type !== 'string') {
      throw new Error('Protected frame must be an object with type')
    }
    const message = parseTicketResidentServerMessage(value)
    const controlLimit = message.type !== 'snapshot.chunk'
    if (controlLimit && frame.body.byteLength > TICKET_RESIDENT_CONTROL_MAX_BYTES) {
      throw new Error('Control frame exceeds its post-parse body limit')
    }
    if (!controlLimit && frame.body.byteLength > TICKET_RESIDENT_FRAME_MAX_BYTES) {
      throw new Error('Chunk frame exceeds its body limit')
    }
    return { message, deliveryBatchId: frame.deliveryBatchId }
  }

  private requireHandshake(): TicketResidentClientHandshake {
    if (!this.handshake) {
      throw new Error('Protected frame before verified handshake')
    }
    return this.handshake
  }
}
