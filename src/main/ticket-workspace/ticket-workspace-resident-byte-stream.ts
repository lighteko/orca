import type { Duplex } from 'node:stream'
import {
  TICKET_RESIDENT_CONTROL_MAX_BYTES,
  TICKET_RESIDENT_FRAME_MAX_BYTES,
  TICKET_RESIDENT_MAX_CHUNKS,
  TICKET_RESIDENT_TAG_BYTES
} from './ticket-workspace-resident-protocol'

const FRAME_OVERHEAD_BYTES = 4 + TICKET_RESIDENT_TAG_BYTES
const MAX_BUFFERED_INPUT_BYTES =
  TICKET_RESIDENT_MAX_CHUNKS * (TICKET_RESIDENT_FRAME_MAX_BYTES + FRAME_OVERHEAD_BYTES) +
  2 * (TICKET_RESIDENT_CONTROL_MAX_BYTES + FRAME_OVERHEAD_BYTES)

type DeliveryBatch = { id: number; bytes: Buffer; offset: number }

export type TicketResidentReadFrame = {
  body: Buffer
  tag?: Buffer
  deliveryBatchId: number
}

export class TicketResidentByteStream {
  private readonly batches: DeliveryBatch[] = []
  private readonly dataWaiters = new Set<() => void>()
  private bufferedBytes = 0
  private nextBatchId = 0
  private failure: Error | undefined

  constructor(
    private readonly duplex: Duplex,
    private readonly onFailure: (error: Error) => void,
    private readonly onDataWhileIdle: () => boolean
  ) {
    duplex.on('data', (chunk: unknown) => this.receiveChunk(chunk))
    duplex.on('end', () => this.fail(new Error('Input stream ended')))
    duplex.on('error', (error: Error) => this.fail(error))
    duplex.on('close', () => this.fail(new Error('Duplex closed')))
  }

  async readHelloFrame(deadline: number, now: () => number): Promise<TicketResidentReadFrame> {
    const prefix = await this.readExactly(4, deadline, now)
    const bodyBytes = prefix.bytes.readUInt32BE(0)
    if (bodyBytes < 1 || bodyBytes > TICKET_RESIDENT_CONTROL_MAX_BYTES) {
      throw new Error('Hello body length is outside its limit')
    }
    const body = await this.readExactly(bodyBytes, deadline, now)
    return { body: body.bytes, deliveryBatchId: body.lastBatchId }
  }

  async readProtectedFrame(deadline: number, now: () => number): Promise<TicketResidentReadFrame> {
    const prefix = await this.readExactly(4, deadline, now)
    const bodyBytes = prefix.bytes.readUInt32BE(0)
    if (bodyBytes < 1 || bodyBytes > TICKET_RESIDENT_FRAME_MAX_BYTES) {
      throw new Error('Protected body length is outside the allocation bound')
    }
    const body = await this.readExactly(bodyBytes, deadline, now)
    const tag = await this.readExactly(TICKET_RESIDENT_TAG_BYTES, deadline, now)
    return { body: body.bytes, tag: tag.bytes, deliveryBatchId: tag.lastBatchId }
  }

  async write(frame: Buffer, deadline: number, now: () => number): Promise<void> {
    this.throwIfFailed()
    if (now() >= deadline) {
      throw new Error('Deadline exceeded')
    }
    let waitForDrain: Promise<void> | undefined
    const writeDone = new Promise<void>((resolve, reject) => {
      try {
        const accepted = this.duplex.write(frame, (error?: Error | null) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
        if (!accepted) {
          waitForDrain = new Promise<void>((drainResolve, drainReject) => {
            const onDrain = (): void => {
              cleanup()
              drainResolve()
            }
            const onError = (error: Error): void => {
              cleanup()
              drainReject(error)
            }
            const cleanup = (): void => {
              this.duplex.off('drain', onDrain)
              this.duplex.off('error', onError)
            }
            this.duplex.once('drain', onDrain)
            this.duplex.once('error', onError)
          })
        }
      } catch (error) {
        reject(asError(error))
      }
    })
    await this.withDeadline(Promise.all([writeDone, waitForDrain]), deadline, now)
    if (now() >= deadline) {
      throw new Error('Deadline exceeded')
    }
    this.throwIfFailed()
  }

  hasBufferedBytes(): boolean {
    return this.bufferedBytes > 0
  }

  hasBytesInBatch(batchId: number): boolean {
    return this.batches.some(
      (batch) => batch.id === batchId && batch.offset < batch.bytes.byteLength
    )
  }

  destroy(): void {
    this.fail(new Error('Lease retired'))
    this.duplex.destroy()
  }

  private receiveChunk(chunk: unknown): void {
    if (this.failure) {
      return
    }
    if (!Buffer.isBuffer(chunk) || chunk.byteLength === 0) {
      this.fail(new Error('Duplex emitted a non-byte or empty chunk'))
      return
    }
    if (!this.onDataWhileIdle()) {
      this.fail(new Error('Unexpected bytes arrived while no request was active'))
      return
    }
    if (this.bufferedBytes + chunk.byteLength > MAX_BUFFERED_INPUT_BYTES) {
      this.fail(new Error('Buffered input exceeds the protocol ceiling'))
      return
    }
    this.batches.push({ id: this.nextBatchId++, bytes: chunk, offset: 0 })
    this.bufferedBytes += chunk.byteLength
    this.wakeDataWaiters()
  }

  private async readExactly(
    size: number,
    deadline: number,
    now: () => number
  ): Promise<{ bytes: Buffer; lastBatchId: number }> {
    const result = Buffer.allocUnsafe(size)
    let written = 0
    let lastBatchId = -1
    while (written < size) {
      this.throwIfFailed()
      if (now() >= deadline) {
        throw new Error('Deadline exceeded')
      }
      const batch = this.batches[0]
      if (!batch) {
        await this.waitForData(deadline, now)
        continue
      }
      const count = Math.min(size - written, batch.bytes.byteLength - batch.offset)
      batch.bytes.copy(result, written, batch.offset, batch.offset + count)
      batch.offset += count
      written += count
      lastBatchId = batch.id
      this.bufferedBytes -= count
      if (batch.offset === batch.bytes.byteLength) {
        this.batches.shift()
      }
    }
    if (now() >= deadline) {
      throw new Error('Deadline exceeded')
    }
    return { bytes: result, lastBatchId }
  }

  private waitForData(deadline: number, now: () => number): Promise<void> {
    this.throwIfFailed()
    const remaining = deadline - now()
    if (remaining <= 0) {
      return Promise.reject(new Error('Deadline exceeded'))
    }
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const wake = (): void => {
        if (timer !== undefined) {
          clearTimeout(timer)
        }
        this.dataWaiters.delete(wake)
        if (this.failure) {
          reject(this.failure)
        } else {
          resolve()
        }
      }
      const timeout = (): void => {
        if (now() >= deadline) {
          this.dataWaiters.delete(wake)
          reject(new Error('Deadline exceeded'))
          return
        }
        timer = setTimeout(timeout, Math.max(1, deadline - now()))
      }
      this.dataWaiters.add(wake)
      timer = setTimeout(timeout, remaining)
      if (this.bufferedBytes > 0 || this.failure) {
        wake()
      }
    })
  }

  private async withDeadline<T>(
    promise: Promise<T>,
    deadline: number,
    now: () => number
  ): Promise<T> {
    const remaining = deadline - now()
    if (remaining <= 0) {
      throw new Error('Deadline exceeded')
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Deadline exceeded')), remaining)
    })
    try {
      return await Promise.race([promise, timeout])
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }

  private wakeDataWaiters(): void {
    for (const wake of this.dataWaiters) {
      wake()
    }
  }

  private throwIfFailed(): void {
    if (this.failure) {
      throw this.failure
    }
  }

  private fail(error: Error): void {
    if (this.failure) {
      return
    }
    this.failure = error
    this.onFailure(error)
    this.wakeDataWaiters()
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('Duplex operation failed')
}
