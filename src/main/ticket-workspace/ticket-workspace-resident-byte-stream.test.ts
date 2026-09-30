import { Duplex } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { TicketResidentByteStream } from './ticket-workspace-resident-byte-stream'

describe('resident byte stream deadline', () => {
  it('checks the absolute deadline after consuming an already-buffered prefix', async () => {
    const duplex = new EmptyDuplex()
    const stream = new TicketResidentByteStream(
      duplex,
      () => undefined,
      () => true
    )
    duplex.push(Buffer.from([0, 0, 0, 1, 0x7b]))
    let clockReads = 0
    const now = (): number => (clockReads++ === 0 ? 0 : 10)

    await expect(stream.readHelloFrame(10, now)).rejects.toThrow('Deadline exceeded')
    expect(clockReads).toBe(2)
    stream.destroy()
  })

  it('checks an expired deadline before consuming buffered bytes', async () => {
    const duplex = new EmptyDuplex()
    const stream = new TicketResidentByteStream(
      duplex,
      () => undefined,
      () => true
    )
    duplex.push(Buffer.from([0, 0, 0, 1, 0x7b]))

    await expect(stream.readHelloFrame(10, () => 10)).rejects.toThrow('Deadline exceeded')
    stream.destroy()
  })

  it.each([
    { name: 'hello', size: 4_096 },
    { name: 'protected', size: 24_576 }
  ])('accepts an exact $name body cap of $size bytes', async ({ name, size }) => {
    const duplex = new EmptyDuplex()
    const stream = new TicketResidentByteStream(
      duplex,
      () => undefined,
      () => true
    )
    const trailerBytes = name === 'protected' ? 32 : 0
    const wire = Buffer.alloc(4 + size + trailerBytes)
    wire.writeUInt32BE(size)
    duplex.push(wire)

    const frame =
      name === 'hello'
        ? await stream.readHelloFrame(10, () => 0)
        : await stream.readProtectedFrame(10, () => 0)
    expect(frame.body.byteLength).toBe(size)
    stream.destroy()
  })

  it.each([
    { name: 'hello', size: 4_097 },
    { name: 'protected', size: 24_577 }
  ])('rejects a $name body one byte above cap before body allocation', async ({ name, size }) => {
    const duplex = new EmptyDuplex()
    const stream = new TicketResidentByteStream(
      duplex,
      () => undefined,
      () => true
    )
    const prefix = Buffer.alloc(4)
    prefix.writeUInt32BE(size)
    duplex.push(prefix)

    const read =
      name === 'hello' ? stream.readHelloFrame(10, () => 0) : stream.readProtectedFrame(10, () => 0)
    await expect(read).rejects.toThrow(/limit|bound/i)
    stream.destroy()
  })
})

class EmptyDuplex extends Duplex {
  _read(): void {}

  _write(
    _chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    callback()
  }
}
