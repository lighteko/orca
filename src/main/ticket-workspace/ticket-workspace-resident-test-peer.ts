import { Duplex } from 'node:stream'
import { createHmac } from 'node:crypto'
import vector from '../../../docs/reference/ticket-workspace-state/resident-ticket-transport-v1-golden-vectors.json'
import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'
import { validateTicketResidentBinding } from './ticket-workspace-resident-protocol'
import {
  createTicketResidentClientHello,
  verifyTicketResidentServerHello
} from './ticket-workspace-resident-crypto'
import {
  encodeTicketResidentProtectedFrame,
  ticketResidentFrameMacInput
} from './ticket-workspace-resident-frame-crypto'
import { ticketResidentCanonicalJson } from './ticket-workspace-resident-canonical'
import { TicketWorkspaceResidentClient } from './ticket-workspace-resident-client'

export { vector }
export const setupKey = Buffer.from(vector.inputs.setupKeyHex, 'hex')
export const binding = getBinding()
const goldenClientHello = createTicketResidentClientHello(setupKey, binding, randomSource())
export const goldenHandshake = verifyTicketResidentServerHello(
  setupKey,
  binding,
  goldenClientHello,
  vector.hello.serverHello.message
)
export const sourceBoundWire = Buffer.from(vector.protectedFrames[2].wireHex, 'hex')
export const goldenErrorWire = Buffer.from(vector.protectedFrames[3].wireHex, 'hex')

export async function connect(
  duplex: ScriptedDuplex,
  options: { now?: () => number; randomBytes?: (size: number) => Buffer } = {}
) {
  return await TicketWorkspaceResidentClient.connect({
    duplex,
    setupKey,
    expectedBinding: binding,
    now: options.now ?? (() => 100),
    randomBytes: options.randomBytes ?? randomSource()
  })
}

export async function connectedDuplex(
  onWrite: ConstructorParameters<typeof ScriptedDuplex>[0],
  options: { now?: () => number; randomBytes?: (size: number) => Buffer } = {}
) {
  const duplex = new ScriptedDuplex(onWrite)
  const connection = await connect(duplex, options)
  if (connection.status !== 'connected') {
    throw new Error(`Setup failed: ${connection.reason}`)
  }
  return { client: connection.client, duplex }
}

export class ScriptedDuplex extends Duplex {
  readonly writes: Buffer[] = []
  private readonly writeWaiters = new Set<() => void>()

  constructor(
    private readonly onWrite: (index: number, frame: Buffer, push: (bytes: Buffer) => void) => void
  ) {
    super()
  }

  _read(): void {}

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const frame = Buffer.from(chunk)
    const index = this.writes.push(frame) - 1
    for (const wake of this.writeWaiters) {
      wake()
    }
    try {
      this.onWrite(index, frame, (bytes) => this.push(bytes))
      callback()
    } catch (error) {
      callback(error instanceof Error ? error : new Error('Fake peer failed'))
    }
  }

  async waitForWriteCount(count: number): Promise<void> {
    while (this.writes.length < count) {
      await new Promise<void>((resolve) => this.writeWaiters.add(resolve))
    }
  }
}

export function randomSource(values?: Buffer[]): (size: number) => Buffer {
  const supplied = values ?? [
    Buffer.from(vector.inputs.sessionId, 'base64url'),
    Buffer.from(vector.inputs.clientNonce, 'base64url'),
    Buffer.from(vector.inputs.bindRequestId, 'base64url'),
    Buffer.from(vector.inputs.readRequestId, 'base64url'),
    Buffer.from('101112131415161718191a1b1c1d1e1f', 'hex'),
    Buffer.alloc(16, 0x42),
    Buffer.alloc(16, 0x43)
  ]
  let next = 0
  return (size) => {
    const value = supplied[next++]
    if (!value || value.byteLength !== size) {
      throw new Error('Unexpected random request')
    }
    return Buffer.from(value)
  }
}

export function snapshotMessages(snapshot: Buffer): object[] {
  const requestId = vector.inputs.readRequestId
  const messages: object[] = [
    { type: 'snapshot.begin', requestId, snapshotBytes: snapshot.byteLength }
  ]
  for (let offset = 0, index = 0; offset < snapshot.byteLength; offset += 16_384, index += 1) {
    messages.push({
      type: 'snapshot.chunk',
      requestId,
      index,
      bytes: snapshot
        .subarray(offset, Math.min(offset + 16_384, snapshot.byteLength))
        .toString('base64url')
    })
  }
  messages.push({
    type: 'snapshot.end',
    requestId,
    byteCount: snapshot.byteLength,
    chunkCount: messages.length - 1
  })
  return messages
}

export function protectedFrames(messages: readonly object[], firstSequence: number): Buffer[] {
  return messages.map((message, index) => protectedFrame(message, BigInt(firstSequence + index)))
}

export function protectedFrame(message: object, sequence: bigint): Buffer {
  return encodeTicketResidentProtectedFrame(
    message,
    's2c',
    sequence,
    goldenHandshake.s2cKey,
    goldenHandshake.context
  )
}

export function parseProtectedRequestId(frame: Buffer): string {
  const bodyLength = frame.readUInt32BE(0)
  const value: unknown = JSON.parse(frame.subarray(4, 4 + bodyLength).toString('utf8'))
  if (
    value === null ||
    typeof value !== 'object' ||
    !('requestId' in value) ||
    typeof value.requestId !== 'string'
  ) {
    throw new Error('Client request has no request ID')
  }
  return value.requestId
}

export function parseFrame(frame: Buffer | undefined): { message: unknown } {
  if (!frame) {
    throw new Error('Expected client frame')
  }
  const bodyLength = frame.readUInt32BE(0)
  const message: unknown = JSON.parse(frame.subarray(4, 4 + bodyLength).toString('utf8'))
  return { message }
}

export function authenticatedOversizedControl(): Buffer {
  const body = Buffer.from(
    ticketResidentCanonicalJson({
      type: 'error',
      requestId: vector.inputs.readRequestId,
      code: 'source_unavailable',
      padding: 'x'.repeat(4_100)
    }),
    'utf8'
  )
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(body.byteLength)
  const tag = createHmac('sha256', goldenHandshake.s2cKey)
    .update(ticketResidentFrameMacInput('s2c', 1n, body, goldenHandshake.context))
    .digest()
  return Buffer.concat([prefix, body, tag])
}

function getBinding(): TicketResidentBinding {
  const value: unknown = vector.inputs.binding
  if (!validateTicketResidentBinding(value)) {
    throw new Error('Golden vector binding is invalid')
  }
  return value
}
