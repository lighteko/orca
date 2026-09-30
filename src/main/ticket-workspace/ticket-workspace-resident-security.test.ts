import { describe, expect, it } from 'vitest'
import vector from '../../../docs/reference/ticket-workspace-state/resident-ticket-transport-v1-golden-vectors.json'
import { encodeTicketResidentHelloFrame } from './ticket-workspace-resident-crypto'
import {
  authenticatedOversizedControl,
  binding,
  connect,
  connectedDuplex,
  parseProtectedRequestId,
  protectedFrame,
  protectedFrames,
  randomSource,
  ScriptedDuplex,
  sourceBoundWire
} from './ticket-workspace-resident-test-peer'

describe('resident protocol fail-closed boundaries', () => {
  it.each([
    {
      name: 'service binding',
      serverHello: {
        ...vector.hello.serverHello.message,
        binding: { ...binding, authorityId: 'other-authority' }
      }
    },
    {
      name: 'artifact digest',
      serverHello: {
        ...vector.hello.serverHello.message,
        binding: {
          ...binding,
          expectedService: { ...binding.expectedService, artifactSha256: 'cd'.repeat(32) }
        }
      }
    },
    {
      name: 'capability order',
      serverHello: {
        ...vector.hello.serverHello.message,
        capabilities: ['source.bind.v1', 'snapshot.read.v1', 'no-start.v1']
      }
    }
  ])('rejects changed $name before client finish', async ({ serverHello }) => {
    const duplex = new ScriptedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(encodeTicketResidentHelloFrame(serverHello))
      }
    })
    await expect(connect(duplex)).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid_protocol'
    })
    expect(duplex.writes).toHaveLength(1)
    expect(duplex.destroyed).toBe(true)
  })

  it('rejects an authenticated invalid ledger epoch during bind', async () => {
    const duplex = new ScriptedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(
          protectedFrame(
            {
              type: 'source.bound',
              requestId: vector.inputs.bindRequestId,
              authorityId: binding.authorityId,
              ledgerEpoch: 'bad\u0000epoch'
            },
            0n
          )
        )
      }
    })
    await expect(connect(duplex)).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid_protocol'
    })
    expect(duplex.destroyed).toBe(true)
  })

  it('retires the lease on authenticated authority rebind', async () => {
    const session = await connectedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        push(
          protectedFrame(
            {
              type: 'error',
              requestId: vector.inputs.readRequestId,
              code: 'authority_rebind_required'
            },
            1n
          )
        )
      }
    })
    await expect(session.client.readSnapshot()).resolves.toEqual({
      status: 'unavailable',
      reason: 'authority_rebind_required'
    })
    expect(session.client.isRetired).toBe(true)
    expect(session.duplex.destroyed).toBe(true)
  })

  it.each([
    {
      name: 'wrong request ID',
      messages: [
        { type: 'snapshot.begin', requestId: vector.inputs.bindRequestId, snapshotBytes: 1 }
      ]
    },
    {
      name: 'out-of-order chunk index',
      messages: [
        { type: 'snapshot.begin', requestId: vector.inputs.readRequestId, snapshotBytes: 1 },
        { type: 'snapshot.chunk', requestId: vector.inputs.readRequestId, index: 1, bytes: 'eA' }
      ]
    }
  ])('retires on $name in authenticated response', async ({ messages }) => {
    const session = await connectedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        push(Buffer.concat(protectedFrames(messages, 1)))
      }
    })
    await expect(session.client.readSnapshot()).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid_protocol'
    })
    expect(session.client.isRetired).toBe(true)
    expect(session.duplex.destroyed).toBe(true)
  })

  it.each(['replayed sequence', 'bad tag'])('rejects a %s frame', async (mutation) => {
    const session = await connectedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        const frame = protectedFrame(
          {
            type: 'error',
            requestId: vector.inputs.readRequestId,
            code: 'source_unavailable'
          },
          mutation === 'replayed sequence' ? 0n : 1n
        )
        if (mutation === 'bad tag') {
          frame[frame.length - 1] = (frame.at(-1) ?? 0) ^ 0xff
        }
        push(frame)
      }
    })
    await expect(session.client.readSnapshot()).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid_protocol'
    })
    expect(session.duplex.destroyed).toBe(true)
  })

  it('authenticates before rejecting an over-limit control-shaped frame', async () => {
    const frame = authenticatedOversizedControl()
    expect(frame.readUInt32BE(0)).toBeGreaterThan(4_096)
    const session = await connectedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        push(frame)
      }
    })
    await expect(session.client.readSnapshot()).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'invalid_protocol'
    })
    expect(session.duplex.destroyed).toBe(true)
  })

  it('does not retry a disconnected read or reuse a request identifier', async () => {
    let peer: ScriptedDuplex | undefined
    peer = new ScriptedDuplex((index, _frame, push) => {
      if (index === 0) {
        push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
      }
      if (index === 2) {
        push(sourceBoundWire)
      }
      if (index === 3) {
        if (!peer) {
          throw new Error('Peer is not initialized')
        }
        peer.push(null)
      }
    })
    const connection = await connect(peer)
    if (connection.status !== 'connected') {
      throw new Error('Setup did not connect')
    }
    await expect(connection.client.readSnapshot()).resolves.toEqual({
      status: 'unavailable',
      reason: 'disconnected'
    })
    expect(peer.writes).toHaveLength(4)
    expect(peer.destroyed).toBe(true)

    const reusedId = Buffer.from(vector.inputs.bindRequestId, 'base64url')
    const repeated = [
      Buffer.from(vector.inputs.sessionId, 'base64url'),
      Buffer.from(vector.inputs.clientNonce, 'base64url'),
      reusedId,
      reusedId
    ]
    const duplicate = await connectedDuplex(
      (index, _frame, push) => {
        if (index === 0) {
          push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
        }
        if (index === 2) {
          push(sourceBoundWire)
        }
      },
      { randomBytes: randomSource(repeated) }
    )
    await expect(duplicate.client.readSnapshot()).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid_protocol'
    })
    expect(duplicate.duplex.writes).toHaveLength(3)
    expect(duplicate.duplex.destroyed).toBe(true)
  })

  it('retires if a response arrives after cancellation settlement', async () => {
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
        push(protectedFrame({ type: 'snapshot.begin', requestId, snapshotBytes: 11 }, sequence++))
      }
      if (index === 4) {
        push(protectedFrame({ type: 'cancelled', requestId }, sequence++))
      }
    })
    const abort = new AbortController()
    const pending = session.client.readSnapshot(abort.signal)
    await session.duplex.waitForWriteCount(4)
    abort.abort()
    await expect(pending).resolves.toEqual({ status: 'unavailable', reason: 'cancelled' })
    session.duplex.push(
      protectedFrame(
        {
          type: 'snapshot.end',
          requestId,
          byteCount: 11,
          chunkCount: 1
        },
        sequence
      )
    )
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(session.client.isRetired).toBe(true)
    expect(session.duplex.destroyed).toBe(true)
  })
})
