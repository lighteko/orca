import { describe, expect, it } from 'vitest'
import type { TicketResidentReceivedMessage } from './ticket-workspace-resident-protected-channel'
import { TicketResidentReadOperation } from './ticket-workspace-resident-read-operation'
import { TicketResidentSnapshotResponse } from './ticket-workspace-resident-snapshot-response'

describe('resident read admission deadline', () => {
  it('does not return a candidate when the clock expires during terminal validation', async () => {
    const snapshot = Buffer.from('{"ok":true}', 'utf8')
    const requestId = 'gIGCg4SFhoeIiYqLjI2Ojw'
    const frames: TicketResidentReceivedMessage[] = [
      {
        message: { type: 'snapshot.begin', requestId, snapshotBytes: snapshot.byteLength },
        deliveryBatchId: 1
      },
      {
        message: {
          type: 'snapshot.chunk',
          requestId,
          index: 0,
          bytes: snapshot.toString('base64url')
        },
        deliveryBatchId: 2
      },
      {
        message: { type: 'snapshot.end', requestId, byteCount: snapshot.byteLength, chunkCount: 1 },
        deliveryBatchId: 3
      }
    ]
    let nextFrame = 0
    let clockReads = 0
    const channel = {
      send: async (): Promise<void> => undefined,
      receive: async () => {
        const frame = frames[nextFrame]
        if (!frame) {
          throw new Error('No fake server frame remains')
        }
        nextFrame += 1
        return frame
      }
    }
    const stream = { hasBytesInBatch: (): boolean => false, hasBufferedBytes: (): boolean => false }
    const operation = new TicketResidentReadOperation(
      stream,
      channel,
      new TicketResidentSnapshotResponse(),
      () => (clockReads++ === 0 ? 0 : 10_000)
    )

    await expect(
      operation.run(
        requestId,
        10_000,
        undefined,
        () => undefined,
        () => undefined
      )
    ).rejects.toThrow('Deadline exceeded')
    expect(nextFrame).toBe(3)
    expect(clockReads).toBe(2)
  })
})
