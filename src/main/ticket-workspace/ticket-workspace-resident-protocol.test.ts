import { describe, expect, it } from 'vitest'
import vector from '../../../docs/reference/ticket-workspace-state/resident-ticket-transport-v1-golden-vectors.json'
import type {
  TicketResidentBinding,
  TicketResidentDirection
} from './ticket-workspace-resident-protocol'
import { validateTicketResidentBinding } from './ticket-workspace-resident-protocol'
import {
  parseTicketResidentCanonicalJson,
  ticketResidentCanonicalJson
} from './ticket-workspace-resident-canonical'
import {
  createTicketResidentClientHello,
  encodeTicketResidentHelloFrame,
  verifyTicketResidentServerHello
} from './ticket-workspace-resident-crypto'
import {
  encodeTicketResidentProtectedFrame,
  verifyTicketResidentProtectedFrameTag
} from './ticket-workspace-resident-frame-crypto'

describe('resident logical-v1 protocol vectors', () => {
  const setupKey = Buffer.from(vector.inputs.setupKeyHex, 'hex')
  const binding = getBinding()
  const fixedRandom = [
    Buffer.from(vector.inputs.sessionId, 'base64url'),
    Buffer.from(vector.inputs.clientNonce, 'base64url')
  ]
  let randomIndex = 0

  it('matches the checked-in hello proofs, finish, transcript and directional keys', () => {
    randomIndex = 0
    const clientHello = createTicketResidentClientHello(setupKey, binding, (size) => {
      const next = fixedRandom[randomIndex++]
      if (!next || next.byteLength !== size) {
        throw new Error('Unexpected random request')
      }
      return next
    })
    expect(encodeTicketResidentHelloFrame(clientHello).toString('hex')).toBe(
      vector.hello.clientHello.wireHex
    )

    const handshake = verifyTicketResidentServerHello(
      setupKey,
      binding,
      clientHello,
      vector.hello.serverHello.message
    )
    expect(encodeTicketResidentHelloFrame(handshake.clientFinish).toString('hex')).toBe(
      vector.hello.clientFinish.wireHex
    )
    expect(handshake.context.transcriptHash.toString('hex')).toBe(vector.transcript.sha256RawHex)
    expect(handshake.c2sKey.toString('hex')).toBe(vector.hkdf.c2s.keyHex)
    expect(handshake.s2cKey.toString('hex')).toBe(vector.hkdf.s2c.keyHex)

    for (const frame of vector.protectedFrames) {
      if (frame.direction !== 'c2s' && frame.direction !== 's2c') {
        throw new Error('Invalid vector direction')
      }
      const direction: TicketResidentDirection = frame.direction
      const key = direction === 'c2s' ? handshake.c2sKey : handshake.s2cKey
      const encoded = encodeTicketResidentProtectedFrame(
        frame.message,
        direction,
        BigInt(frame.sequence),
        key,
        handshake.context
      )
      expect(encoded.toString('hex')).toBe(frame.wireHex)
      if (direction === 's2c') {
        const bodyLength = encoded.readUInt32BE(0)
        const body = encoded.subarray(4, 4 + bodyLength)
        const tag = encoded.subarray(4 + bodyLength)
        expect(
          verifyTicketResidentProtectedFrameTag(
            direction,
            BigInt(frame.sequence),
            body,
            tag,
            key,
            handshake.context
          )
        ).toBe(true)
        expect(
          verifyTicketResidentProtectedFrameTag(
            direction,
            BigInt(frame.sequence) + 1n,
            body,
            tag,
            key,
            handshake.context
          )
        ).toBe(false)
      }
    }
  })

  it('uses UTF-16 key ordering and rejects noncanonical, duplicate-key and invalid UTF-8 bodies', () => {
    const canonical = vector.canonicalOrdering.canonicalJson
    expect(ticketResidentCanonicalJson(vector.canonicalOrdering.input)).toBe(canonical)
    expect(Buffer.from(canonical, 'utf8').toString('hex')).toBe(vector.canonicalOrdering.utf8Hex)
    expect(parseTicketResidentCanonicalJson(Buffer.from(canonical, 'utf8'))).toEqual(
      vector.canonicalOrdering.input
    )
    expect(() => parseTicketResidentCanonicalJson(Buffer.from('{ "a":1}', 'utf8'))).toThrow(
      /canonical/i
    )
    expect(() => parseTicketResidentCanonicalJson(Buffer.from('{"a":1,"a":1}', 'utf8'))).toThrow(
      /canonical/i
    )
    expect(() => parseTicketResidentCanonicalJson(Buffer.from([0xc3, 0x28]))).toThrow()
  })

  it('rejects transcript mutation and non-safe numeric fields before accepting a proof', () => {
    randomIndex = 0
    const clientHello = createTicketResidentClientHello(setupKey, binding, (size) => {
      const next = fixedRandom[randomIndex++]
      if (!next || next.byteLength !== size) {
        throw new Error('Unexpected random request')
      }
      return next
    })
    const changedHello = {
      ...vector.hello.serverHello.message,
      connectionIncarnation: vector.inputs.sessionId
    }
    expect(() =>
      verifyTicketResidentServerHello(setupKey, binding, clientHello, changedHello)
    ).toThrow()
    expect(() => ticketResidentCanonicalJson({ value: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      /safe integers/i
    )
    expect(() => ticketResidentCanonicalJson({ value: 1.25 })).toThrow(/safe integers/i)
  })
})

function getBinding(): TicketResidentBinding {
  const value: unknown = vector.inputs.binding
  if (!validateTicketResidentBinding(value)) {
    throw new Error('Golden vector binding is invalid')
  }
  return value
}
