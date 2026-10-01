import type {
  TicketResidentBinding,
  TicketResidentClientHandshake
} from './ticket-workspace-resident-protocol'
import {
  encodeTicketResidentHelloFrame,
  createTicketResidentClientHello,
  verifyTicketResidentServerHello
} from './ticket-workspace-resident-crypto'
import { parseTicketResidentCanonicalJson } from './ticket-workspace-resident-canonical'
import type { TicketResidentByteStream } from './ticket-workspace-resident-byte-stream'
import type { TicketResidentProtectedChannel } from './ticket-workspace-resident-protected-channel'

export async function setupResidentClientBinding(
  options: Readonly<{
    setupKey: Buffer
    expectedBinding: TicketResidentBinding
    now: () => number
    randomBytes: (size: number) => Buffer
    reader: TicketResidentByteStream
    channel: TicketResidentProtectedChannel
    deadline: number
    allocateRequestId(): string
    onAuthenticated(handshake: TicketResidentClientHandshake): void
  }>
): Promise<{ handshake: TicketResidentClientHandshake; ledgerEpoch: string }> {
  const clientHello = createTicketResidentClientHello(
    options.setupKey,
    options.expectedBinding,
    options.randomBytes
  )
  await options.reader.write(
    encodeTicketResidentHelloFrame(clientHello),
    options.deadline,
    options.now
  )
  const serverHelloFrame = await options.reader.readHelloFrame(options.deadline, options.now)
  const serverHelloValue = parseTicketResidentCanonicalJson(serverHelloFrame.body)
  if (
    options.reader.hasBytesInBatch(serverHelloFrame.deliveryBatchId) ||
    options.reader.hasBufferedBytes()
  ) {
    throw new Error('Unexpected data followed server hello')
  }
  const handshake = verifyTicketResidentServerHello(
    options.setupKey,
    options.expectedBinding,
    clientHello,
    serverHelloValue
  )
  options.channel.setHandshake(handshake)
  options.onAuthenticated(handshake)

  await options.reader.write(
    encodeTicketResidentHelloFrame(handshake.clientFinish),
    options.deadline,
    options.now
  )
  const bindBudget = Math.floor(Math.min(5_000, options.deadline - options.now()))
  if (bindBudget < 1) {
    throw new Error('Deadline exceeded')
  }
  const bindRequestId = options.allocateRequestId()
  await options.channel.send(
    {
      type: 'source.bind',
      requestId: bindRequestId,
      profile: options.expectedBinding.profile,
      authorityId: options.expectedBinding.authorityId,
      deadlineBudgetMs: bindBudget
    },
    options.deadline
  )
  const response = await options.channel.receive(options.deadline)
  if (response.message.type === 'error' && response.message.requestId === bindRequestId) {
    throw new Error(response.message.code)
  }
  if (
    response.message.type !== 'source.bound' ||
    response.message.requestId !== bindRequestId ||
    response.message.authorityId !== options.expectedBinding.authorityId ||
    options.reader.hasBytesInBatch(response.deliveryBatchId) ||
    options.reader.hasBufferedBytes()
  ) {
    throw new Error('Invalid source binding receipt')
  }
  if (options.now() >= options.deadline) {
    throw new Error('Deadline exceeded')
  }
  return { handshake, ledgerEpoch: response.message.ledgerEpoch }
}
