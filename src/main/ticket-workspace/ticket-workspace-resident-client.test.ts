import { Duplex } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import vector from '../../../docs/reference/ticket-workspace-state/resident-ticket-transport-v1-golden-vectors.json'
import { TicketWorkspaceResidentClient } from './ticket-workspace-resident-client'
import { ticketResidentCanonicalJson } from './ticket-workspace-resident-canonical'
import {
  binding,
  connect,
  connectedDuplex,
  goldenErrorWire,
  parseFrame,
  parseProtectedRequestId,
  protectedFrames,
  randomSource,
  ScriptedDuplex,
  setupKey,
  snapshotMessages,
  sourceBoundWire
} from './ticket-workspace-resident-test-peer'

describe('resident injected duplex client', () => {
  afterEach(() => vi.useRealTimers())

  it('finishes the authenticated bind and reads with the producer-selected epoch', async () => {
    const duplex = new ScriptedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        push(goldenErrorWire)
      }
    })
    const connection = await connect(duplex)
    expect(connection.status).toBe('connected')
    if (connection.status !== 'connected') {
      return
    }

    expect(connection.client.connectionIncarnation).toBe(vector.inputs.connectionIncarnation)
    expect(connection.client.boundLedgerEpoch).toBe('epoch-a')
    expect(duplex.writes.slice(0, 3).map((frame) => frame.toString('hex'))).toEqual([
      vector.hello.clientHello.wireHex,
      vector.hello.clientFinish.wireHex,
      vector.protectedFrames[0].wireHex
    ])
    await expect(connection.client.readSnapshot()).resolves.toEqual({
      status: 'unavailable',
      reason: 'snapshot_too_large'
    })
    expect(parseFrame(duplex.writes[3]).message).toMatchObject({
      type: 'snapshot.read',
      requestId: vector.inputs.readRequestId,
      ledgerEpoch: 'epoch-a',
      deadlineBudgetMs: 10_000
    })
    connection.client.close()
  })

  it('reduces a caller budget by monotonic time spent preparing the read', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(0))
    let sixteenByteRequests = 0
    const suppliedRandom = randomSource()
    const session = await connectedDuplex(
      (index, _frame, push) => {
        if (index === 0) {
          push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
        }
        if (index === 2) {
          push(sourceBoundWire)
        }
        if (index === 3) {
          push(goldenErrorWire)
        }
      },
      {
        now: () => Date.now(),
        randomBytes: (size) => {
          const bytes = suppliedRandom(size)
          if (size === 16 && ++sixteenByteRequests === 3) {
            vi.advanceTimersByTime(500)
          }
          return bytes
        }
      }
    )

    await expect(session.client.readSnapshot(undefined, 2_500)).resolves.toEqual({
      status: 'unavailable',
      reason: 'snapshot_too_large'
    })
    expect(parseFrame(session.duplex.writes[3]).message).toMatchObject({
      type: 'snapshot.read',
      deadlineBudgetMs: 2_000
    })
    session.client.close()
  })

  it('rejects invalid budgets without writing or retiring the bound lease', async () => {
    const session = await connectedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
    })
    for (const budget of [0, -1, 10_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(session.client.readSnapshot(undefined, budget)).resolves.toEqual({
        status: 'unavailable',
        reason: 'invalid_deadline_budget'
      })
    }
    expect(session.duplex.writes).toHaveLength(3)
    expect(session.client.isRetired).toBe(false)
    session.client.close()
  })

  it('does not send a read when its monotonic budget is already expired', async () => {
    let expireDuringPreflight = false
    let preflightClockReads = 0
    const now = (): number => {
      if (!expireDuringPreflight) {
        return 100
      }
      preflightClockReads += 1
      return preflightClockReads === 1 ? 100 : 101
    }
    const session = await connectedDuplex(
      (index, _frame, push) => {
        if (index === 0) {
          push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
        }
        if (index === 2) {
          push(sourceBoundWire)
        }
      },
      { now }
    )
    expireDuringPreflight = true

    await expect(session.client.readSnapshot(undefined, 1)).resolves.toEqual({
      status: 'unavailable',
      reason: 'deadline_exceeded'
    })
    expect(session.duplex.writes).toHaveLength(3)
    expect(session.client.isRetired).toBe(false)
    session.client.close()
  })

  it('retires without emitting a read when framing consumes the caller budget', async () => {
    let reading = false
    let readClockCalls = 0
    const now = (): number => {
      if (!reading) {
        return 100
      }
      readClockCalls += 1
      return readClockCalls === 4 ? 2_600 : 100
    }
    const session = await connectedDuplex(
      (index, _frame, push) => {
        if (index === 0) {
          push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
        }
        if (index === 2) {
          push(sourceBoundWire)
        }
      },
      { now }
    )
    reading = true

    await expect(session.client.readSnapshot(undefined, 2_500)).resolves.toEqual({
      status: 'unavailable',
      reason: 'deadline_exceeded'
    })
    expect(readClockCalls).toBe(4)
    expect(session.duplex.writes).toHaveLength(3)
    expect(session.client.isRetired).toBe(true)
    expect(session.duplex.destroyed).toBe(true)
  })

  it('reassembles split frame and UTF-8 chunk boundaries as exact raw snapshot bytes', async () => {
    const snapshotBytes = Buffer.from('{"ticket":"한글 📦"}', 'utf8')
    const duplex = await connectedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        for (const frame of protectedFrames(snapshotMessages(snapshotBytes), 1)) {
          push(frame.subarray(0, 2))
          push(frame.subarray(2, 6))
          push(frame.subarray(6, -32))
          push(frame.subarray(-32))
        }
      }
    })
    await expect(duplex.client.readSnapshot()).resolves.toEqual({
      status: 'snapshot',
      snapshotBytes
    })
    expect(duplex.client.isRetired).toBe(false)
    duplex.client.close()
  })

  it('accepts exactly 2 MiB and retires on same-batch trailing bytes', async () => {
    const exactPayload = Buffer.from(`{"data":"${'a'.repeat(2_097_152 - 11)}"}`, 'utf8')
    expect(exactPayload.byteLength).toBe(2_097_152)
    const exact = await connectedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        push(Buffer.concat(protectedFrames(snapshotMessages(exactPayload), 1)))
      }
    })
    const result = await exact.client.readSnapshot()
    expect(result.status).toBe('snapshot')
    if (result.status === 'snapshot') {
      expect(result.snapshotBytes).toEqual(exactPayload)
    }
    exact.client.close()

    const trailing = await connectedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        push(
          Buffer.concat([
            ...protectedFrames(snapshotMessages(Buffer.from('{"ok":true}')), 1),
            Buffer.from([0, 0, 0, 1, 0x7b])
          ])
        )
      }
    })
    await expect(trailing.client.readSnapshot()).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid_protocol'
    })
    expect(trailing.client.isRetired).toBe(true)
    expect(trailing.duplex.destroyed).toBe(true)
  }, 15_000)

  it('retires and destroys the duplex when any byte arrives after admission', async () => {
    const session = await connectedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        push(Buffer.concat(protectedFrames(snapshotMessages(Buffer.from('{"ok":true}')), 1)))
      }
    })
    await expect(session.client.readSnapshot()).resolves.toMatchObject({ status: 'snapshot' })
    session.duplex.push(Buffer.from([0]))
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(session.client.isRetired).toBe(true)
    expect(session.duplex.destroyed).toBe(true)
  })

  it('rejects a huge delivered batch before retaining it', async () => {
    const duplex = new ScriptedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.alloc(4_000_000))
      }
    })
    await expect(connect(duplex)).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid_protocol'
    })
    expect(duplex.destroyed).toBe(true)
  })

  it('settles cancellation before reusing the bound lease for one more read', async () => {
    let requestId = ''
    let sequence = 1n
    const session = await connectedDuplex((index, frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        requestId = parseProtectedRequestId(frame)
        push(
          protectedFrames(
            [{ type: 'snapshot.begin', requestId, snapshotBytes: 11 }],
            Number(sequence)
          )[0]!
        )
        sequence += 1n
      }
      if (index === 4) {
        push(protectedFrames([{ type: 'cancelled', requestId }], Number(sequence))[0]!)
        sequence += 1n
      }
      if (index === 5) {
        const secondRequestId = parseProtectedRequestId(frame)
        push(
          protectedFrames(
            [{ type: 'error', requestId: secondRequestId, code: 'source_unavailable' }],
            Number(sequence)
          )[0]!
        )
      }
    })
    const abort = new AbortController()
    const firstRead = session.client.readSnapshot(abort.signal)
    await session.duplex.waitForWriteCount(4)
    abort.abort()
    await expect(firstRead).resolves.toEqual({ status: 'unavailable', reason: 'cancelled' })
    await expect(session.client.readSnapshot()).resolves.toEqual({
      status: 'unavailable',
      reason: 'source_unavailable'
    })
    expect(session.client.isRetired).toBe(false)
    session.client.close()
  })

  it('retires a silent setup at five seconds and a read at its original deadline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(0))
    const setup = new ScriptedDuplex(() => undefined)
    const pendingSetup = TicketWorkspaceResidentClient.connect({
      duplex: setup,
      setupKey,
      expectedBinding: binding,
      now: () => Date.now(),
      randomBytes: randomSource()
    })
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(pendingSetup).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'deadline_exceeded'
    })
    expect(setup.destroyed).toBe(true)

    const read = new ScriptedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
    })
    const connected = await TicketWorkspaceResidentClient.connect({
      duplex: read,
      setupKey,
      expectedBinding: binding,
      now: () => Date.now(),
      randomBytes: randomSource()
    })
    if (connected.status !== 'connected') {
      throw new Error('Setup did not connect')
    }
    const pendingRead = connected.client.readSnapshot(undefined, 2_500)
    expect(parseFrame(read.writes[3]).message).toMatchObject({
      type: 'snapshot.read',
      deadlineBudgetMs: 2_500
    })
    await vi.advanceTimersByTimeAsync(2_500)
    await expect(pendingRead).resolves.toEqual({
      status: 'unavailable',
      reason: 'deadline_exceeded'
    })
    expect(connected.client.isRetired).toBe(true)
    expect(read.destroyed).toBe(true)
  })

  it('keeps cancellation settlement inside the caller deadline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(0))
    const read = new ScriptedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        push(
          protectedFrames(
            [{ type: 'snapshot.begin', requestId: vector.inputs.readRequestId, snapshotBytes: 11 }],
            1
          )[0]!
        )
      }
    })
    const connected = await TicketWorkspaceResidentClient.connect({
      duplex: read,
      setupKey,
      expectedBinding: binding,
      now: () => Date.now(),
      randomBytes: randomSource()
    })
    if (connected.status !== 'connected') {
      throw new Error('Setup did not connect')
    }
    const abort = new AbortController()
    const pending = connected.client.readSnapshot(abort.signal, 2_500)
    await read.waitForWriteCount(4)
    expect(parseFrame(read.writes[3]).message).toMatchObject({ deadlineBudgetMs: 2_500 })
    await vi.advanceTimersByTimeAsync(2_000)
    abort.abort()
    await read.waitForWriteCount(5)
    expect(parseFrame(read.writes[4]).message).toMatchObject({ type: 'cancel' })
    await vi.advanceTimersByTimeAsync(500)

    await expect(pending).resolves.toEqual({
      status: 'unavailable',
      reason: 'deadline_exceeded'
    })
    expect(connected.client.isRetired).toBe(true)
    expect(read.destroyed).toBe(true)
  })

  it('checks the setup deadline again after source.bound validation', async () => {
    let receiptDelivered = false
    let clockReadsAfterReceipt = 0
    const now = (): number => {
      if (!receiptDelivered) {
        return 0
      }
      clockReadsAfterReceipt += 1
      return clockReadsAfterReceipt >= 9 ? 5_000 : 0
    }
    const duplex = new ScriptedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
        receiptDelivered = true
      }
    })
    await expect(
      TicketWorkspaceResidentClient.connect({
        duplex,
        setupKey,
        expectedBinding: binding,
        now,
        randomBytes: randomSource()
      })
    ).resolves.toEqual({ status: 'unavailable', reason: 'deadline_exceeded' })
    expect(duplex.destroyed).toBe(true)
  })

  it('consumes launch ready on the same stream and clamps hello/bind to its relative budget', async () => {
    const duplex = new LaunchReadyDuplex(
      launchReadyFrame(4_200),
      (index, push) => {
        if (index === 0) {
          push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
        }
        if (index === 2) {
          push(sourceBoundWire)
        }
      },
      true
    )
    const connected = await TicketWorkspaceResidentClient.connect({
      duplex,
      setupKey,
      expectedBinding: binding,
      setupBudgetMs: 8_000,
      expectLaunchReady: true,
      now: () => 100,
      randomBytes: randomSource()
    })

    expect(connected.status).toBe('connected')
    expect(duplex.writes).toHaveLength(3)
    expect(parseFrame(duplex.writes[2]).message).toMatchObject({
      type: 'source.bind',
      deadlineBudgetMs: 4_200
    })
    if (connected.status === 'connected') {
      connected.client.close()
    }
  })

  it('rejects malformed launch ready before sending client hello', async () => {
    const extraField = frameBody(
      Buffer.from(
        ticketResidentCanonicalJson({
          contract: 'ticket.navigator.resident.launch',
          remainingSetupMs: 5_000,
          type: 'ready',
          version: 1,
          unexpected: true
        }),
        'utf8'
      )
    )
    const bom = frameBody(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), launchReadyBody(5_000)]))
    const unknownType = frameBody(
      Buffer.from(
        ticketResidentCanonicalJson({
          contract: 'ticket.navigator.resident.launch',
          remainingSetupMs: 5_000,
          type: 'hello',
          version: 1
        }),
        'utf8'
      )
    )
    const oversized = Buffer.alloc(4)
    oversized.writeUInt32BE(4_097)
    const coalesced = Buffer.concat([launchReadyFrame(5_000), Buffer.from([0, 0, 0, 1, 0x7b])])

    for (const ready of [extraField, bom, unknownType, oversized, coalesced]) {
      const duplex = new LaunchReadyDuplex(ready, () => undefined)
      await expect(
        TicketWorkspaceResidentClient.connect({
          duplex,
          setupKey,
          expectedBinding: binding,
          setupBudgetMs: 8_000,
          expectLaunchReady: true,
          now: () => 100,
          randomBytes: randomSource()
        })
      ).resolves.toMatchObject({ status: 'unavailable', reason: 'invalid_protocol' })
      expect(duplex.writes).toHaveLength(0)
      expect(duplex.destroyed).toBe(true)
    }
  })

  it('settles a partial launch-ready frame at the caller startup budget', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(0))
    const partial = Buffer.alloc(4)
    partial.writeUInt32BE(100)
    const duplex = new LaunchReadyDuplex(partial, () => undefined)
    const pending = TicketWorkspaceResidentClient.connect({
      duplex,
      setupKey,
      expectedBinding: binding,
      setupBudgetMs: 750,
      expectLaunchReady: true,
      now: () => Date.now(),
      randomBytes: randomSource()
    })
    await vi.advanceTimersByTimeAsync(750)
    await expect(pending).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'deadline_exceeded'
    })
    expect(duplex.writes).toHaveLength(0)
    expect(duplex.destroyed).toBe(true)
  })

  it('rejects invalid startup budgets without emitting a handshake frame', async () => {
    for (const setupBudgetMs of [0, -1, 10_001, 1.5, Number.NaN]) {
      const duplex = new ScriptedDuplex(() => undefined)
      await expect(
        TicketWorkspaceResidentClient.connect({
          duplex,
          setupKey,
          expectedBinding: binding,
          setupBudgetMs,
          expectLaunchReady: true,
          now: () => 100,
          randomBytes: randomSource()
        })
      ).resolves.toEqual({ status: 'unavailable', reason: 'invalid_deadline_budget' })
      expect(duplex.writes).toHaveLength(0)
      expect(duplex.destroyed).toBe(true)
    }
  })
})

class LaunchReadyDuplex extends Duplex {
  readonly writes: Buffer[] = []

  constructor(
    ready: Buffer,
    private readonly onWrite: (index: number, push: (bytes: Buffer) => void) => void,
    splitReady = false
  ) {
    super()
    queueMicrotask(() => {
      if (splitReady) {
        const split = Math.min(2, ready.byteLength)
        this.push(ready.subarray(0, split))
        queueMicrotask(() => this.push(ready.subarray(split)))
      } else {
        this.push(ready)
      }
    })
  }

  _read(): void {}

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const index = this.writes.push(Buffer.from(chunk)) - 1
    try {
      this.onWrite(index, (bytes) => this.push(bytes))
      callback()
    } catch (error) {
      callback(error instanceof Error ? error : new Error('Launch fake peer failed'))
    }
  }
}

function launchReadyBody(remainingSetupMs: number): Buffer {
  return Buffer.from(
    ticketResidentCanonicalJson({
      contract: 'ticket.navigator.resident.launch',
      remainingSetupMs,
      type: 'ready',
      version: 1
    }),
    'utf8'
  )
}

function launchReadyFrame(remainingSetupMs: number): Buffer {
  return frameBody(launchReadyBody(remainingSetupMs))
}

function frameBody(body: Buffer): Buffer {
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(body.byteLength)
  return Buffer.concat([prefix, body])
}
