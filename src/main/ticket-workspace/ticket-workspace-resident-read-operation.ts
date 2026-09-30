import type { TicketResidentUnavailableReason } from './ticket-workspace-resident-client-contract'
import type { TicketResidentServerMessage } from './ticket-workspace-resident-protocol'
import type { TicketResidentReceivedMessage } from './ticket-workspace-resident-protected-channel'
import type { TicketResidentSnapshotResponse } from './ticket-workspace-resident-snapshot-response'
import type { TicketResidentSnapshotResult } from './ticket-workspace-resident-client-contract'

type ReadTerminal = Extract<
  TicketResidentServerMessage,
  { type: 'error' | 'cancelled' | 'snapshot.end' }
>
type ResidentReadStream = {
  hasBytesInBatch(batchId: number): boolean
  hasBufferedBytes(): boolean
}
type ResidentMessageChannel = {
  send(message: object, deadline: number): Promise<void>
  receive(deadline: number): Promise<TicketResidentReceivedMessage>
}

export class TicketResidentReadOperation {
  constructor(
    private readonly stream: ResidentReadStream,
    private readonly channel: ResidentMessageChannel,
    private readonly response: TicketResidentSnapshotResponse,
    private readonly now: () => number
  ) {}

  async run(
    requestId: string,
    deadline: number,
    signal: AbortSignal | undefined,
    onAdmitting: () => void,
    onRetire: (reason: TicketResidentUnavailableReason) => void
  ): Promise<TicketResidentSnapshotResult> {
    let cancelRequested = false
    let removeAbortListener = (): void => undefined
    const abortWaiter = signal
      ? new Promise<void>((resolve) => {
          const onAbort = (): void => resolve()
          signal.addEventListener('abort', onAbort, { once: true })
          removeAbortListener = () => signal.removeEventListener('abort', onAbort)
          if (signal.aborted) {
            resolve()
          }
        })
      : undefined
    let nextFrame = this.channel.receive(deadline)
    try {
      while (true) {
        if (!cancelRequested && abortWaiter) {
          const result = await Promise.race([
            nextFrame.then((frame) => ({ kind: 'frame' as const, frame })),
            abortWaiter.then(() => ({ kind: 'abort' as const }))
          ])
          if (result.kind === 'abort') {
            cancelRequested = true
            this.response.discardBytes()
            await this.channel.send({ type: 'cancel', requestId }, deadline)
            continue
          }
          const terminal = this.accept(
            result.frame,
            requestId,
            !cancelRequested,
            cancelRequested,
            onAdmitting
          )
          if (terminal) {
            return this.finish(
              terminal,
              result.frame.deliveryBatchId,
              deadline,
              cancelRequested || (signal?.aborted ?? false),
              onRetire
            )
          }
          nextFrame = this.channel.receive(deadline)
          continue
        }
        const frame = await nextFrame
        const terminal = this.accept(
          frame,
          requestId,
          !cancelRequested,
          cancelRequested,
          onAdmitting
        )
        if (terminal) {
          return this.finish(
            terminal,
            frame.deliveryBatchId,
            deadline,
            cancelRequested || (signal?.aborted ?? false),
            onRetire
          )
        }
        nextFrame = this.channel.receive(deadline)
      }
    } finally {
      removeAbortListener()
    }
  }

  private accept(
    frame: TicketResidentReceivedMessage,
    requestId: string,
    keepBytes: boolean,
    cancelRequested: boolean,
    onAdmitting: () => void
  ): ReadTerminal | undefined {
    const terminal = this.response.accept(frame.message, requestId, keepBytes, cancelRequested)
    if (terminal?.type === 'snapshot.end') {
      onAdmitting()
    }
    return terminal
  }

  private finish(
    terminal: ReadTerminal,
    batchId: number,
    deadline: number,
    cancelled: boolean,
    onRetire: (reason: TicketResidentUnavailableReason) => void
  ): TicketResidentSnapshotResult {
    if (this.now() >= deadline) {
      throw new Error('Deadline exceeded')
    }
    if (this.stream.hasBytesInBatch(batchId) || this.stream.hasBufferedBytes()) {
      throw new Error('Bytes followed a request terminal before settlement')
    }
    const result = this.response.finish(terminal, cancelled)
    if (this.now() >= deadline) {
      throw new Error('Deadline exceeded')
    }
    if (
      terminal.type === 'error' &&
      (terminal.code === 'authority_rebind_required' || terminal.code === 'binding_mismatch')
    ) {
      onRetire(terminal.code)
    }
    if (result.status === 'snapshot' && this.stream.hasBufferedBytes()) {
      throw new Error('Bytes arrived before snapshot admission')
    }
    if (this.now() >= deadline) {
      throw new Error('Deadline exceeded')
    }
    return result
  }
}
