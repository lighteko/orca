import {
  TICKET_RESIDENT_CHUNK_MAX_BYTES,
  TICKET_RESIDENT_MAX_CHUNKS,
  TICKET_RESIDENT_SNAPSHOT_MAX_BYTES,
  type TicketResidentServerMessage,
  parseTicketResidentChunkBytes
} from './ticket-workspace-resident-protocol'
import {
  parseTicketResidentCanonicalJson,
  ticketResidentCanonicalJson
} from './ticket-workspace-resident-canonical'
import type { TicketResidentSnapshotResult } from './ticket-workspace-resident-client-contract'

type ReadTerminal = Extract<
  TicketResidentServerMessage,
  { type: 'error' | 'cancelled' | 'snapshot.end' }
>

export class TicketResidentSnapshotResponse {
  private pendingBytes: number | undefined
  private chunks: Buffer[] = []
  private chunkCount = 0
  private accumulatedBytes = 0
  private previousChunkBytes = 0

  accept(
    message: TicketResidentServerMessage,
    requestId: string,
    keepBytes: boolean,
    cancelRequested: boolean
  ): ReadTerminal | undefined {
    if (message.requestId !== requestId) {
      throw new Error('Response request ID mismatch')
    }
    if (message.type === 'error' || message.type === 'cancelled') {
      if (message.type === 'cancelled' && !cancelRequested) {
        throw new Error('Unrequested cancellation terminal')
      }
      if (message.type === 'error' && this.pendingBytes !== undefined) {
        throw new Error('Producer sent an error after snapshot data began')
      }
      return message
    }
    if (message.type === 'snapshot.begin') {
      if (this.pendingBytes !== undefined) {
        throw new Error('Duplicate snapshot.begin')
      }
      this.pendingBytes = message.snapshotBytes
      return undefined
    }
    if (message.type === 'snapshot.chunk') {
      this.acceptChunk(message, keepBytes)
      return undefined
    }
    if (message.type === 'snapshot.end') {
      if (this.pendingBytes === undefined) {
        throw new Error('snapshot.end arrived before begin')
      }
      return message
    }
    throw new Error('Unexpected message in read response')
  }

  finish(terminal: ReadTerminal, cancelled: boolean): TicketResidentSnapshotResult {
    if (terminal.type === 'error') {
      this.reset()
      return { status: 'unavailable', reason: terminal.code }
    }
    if (terminal.type === 'cancelled') {
      this.reset()
      return { status: 'unavailable', reason: 'cancelled' }
    }
    if (
      this.pendingBytes === undefined ||
      terminal.byteCount !== this.pendingBytes ||
      terminal.chunkCount !== this.chunkCount ||
      terminal.byteCount !== this.accumulatedBytes
    ) {
      throw new Error('Snapshot terminal counts do not match')
    }
    const bytes = Buffer.concat(this.chunks, this.accumulatedBytes)
    this.reset()
    if (cancelled) {
      return { status: 'unavailable', reason: 'cancelled' }
    }
    const parsed = parseTicketResidentCanonicalJson(bytes)
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Buffer.from(ticketResidentCanonicalJson(parsed), 'utf8').equals(bytes)
    ) {
      throw new Error('Snapshot payload is not canonical JSON')
    }
    return { status: 'snapshot', snapshotBytes: bytes }
  }

  discardBytes(): void {
    this.chunks = []
  }

  reset(): void {
    this.pendingBytes = undefined
    this.chunks = []
    this.chunkCount = 0
    this.accumulatedBytes = 0
    this.previousChunkBytes = 0
  }

  private acceptChunk(
    message: Extract<TicketResidentServerMessage, { type: 'snapshot.chunk' }>,
    keepBytes: boolean
  ): void {
    if (this.pendingBytes === undefined) {
      throw new Error('Chunk arrived before snapshot.begin')
    }
    const bytes = parseTicketResidentChunkBytes(message)
    if (
      message.index !== this.chunkCount ||
      (this.chunkCount > 0 && this.previousChunkBytes !== TICKET_RESIDENT_CHUNK_MAX_BYTES) ||
      this.chunkCount >= TICKET_RESIDENT_MAX_CHUNKS ||
      this.accumulatedBytes + bytes.byteLength > TICKET_RESIDENT_SNAPSHOT_MAX_BYTES ||
      this.accumulatedBytes + bytes.byteLength > this.pendingBytes
    ) {
      throw new Error('Invalid snapshot chunk sequence')
    }
    this.chunkCount += 1
    this.accumulatedBytes += bytes.byteLength
    this.previousChunkBytes = bytes.byteLength
    if (keepBytes) {
      this.chunks.push(bytes)
    }
  }
}
