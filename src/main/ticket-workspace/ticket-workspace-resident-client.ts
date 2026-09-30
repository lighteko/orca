import { randomBytes as systemRandomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  type TicketResidentBinding,
  type TicketResidentClientHandshake,
  validateTicketResidentBinding
} from './ticket-workspace-resident-protocol'
import type {
  TicketResidentSnapshotResult,
  TicketResidentUnavailableReason,
  TicketWorkspaceResidentClientOptions
} from './ticket-workspace-resident-client-contract'
import { parseTicketResidentCanonicalJson } from './ticket-workspace-resident-canonical'
import {
  createTicketResidentClientHello,
  encodeTicketResidentHelloFrame,
  verifyTicketResidentServerHello
} from './ticket-workspace-resident-crypto'
import { TicketResidentByteStream } from './ticket-workspace-resident-byte-stream'
import { TicketResidentProtectedChannel } from './ticket-workspace-resident-protected-channel'
import { TicketResidentReadOperation } from './ticket-workspace-resident-read-operation'
import { TicketResidentSnapshotResponse } from './ticket-workspace-resident-snapshot-response'

const SETUP_DEADLINE_MS = 5_000
const READ_DEADLINE_MS = 10_000

export type TicketResidentConnectResult =
  | { status: 'connected'; client: TicketWorkspaceResidentClient }
  | { status: 'unavailable'; reason: TicketResidentUnavailableReason }

type ClientState =
  | 'hello'
  | 'authenticated-unbound'
  | 'bound-idle'
  | 'read-in-flight'
  | 'admitting'
  | 'closed'

export class TicketWorkspaceResidentClient {
  static async connect(
    options: TicketWorkspaceResidentClientOptions
  ): Promise<TicketResidentConnectResult> {
    let client: TicketWorkspaceResidentClient
    try {
      client = new TicketWorkspaceResidentClient(options)
    } catch {
      if (options.duplex && typeof options.duplex.destroy === 'function') {
        options.duplex.destroy()
      }
      return { status: 'unavailable', reason: 'invalid_protocol' }
    }
    try {
      await client.setupAndBind()
      return { status: 'connected', client }
    } catch (error) {
      const reason = client.reasonFor(error)
      client.retire(reason)
      return { status: 'unavailable', reason }
    }
  }

  private readonly setupKey: Buffer
  private readonly expectedBinding: TicketResidentBinding
  private readonly now: () => number
  private readonly randomBytes: (size: number) => Buffer
  private readonly reader: TicketResidentByteStream
  private readonly channel: TicketResidentProtectedChannel
  private readonly snapshotResponse = new TicketResidentSnapshotResponse()
  private readonly readOperation: TicketResidentReadOperation
  private readonly allocatedRequestIds = new Set<string>()
  private state: ClientState = 'hello'
  private reason: TicketResidentUnavailableReason | undefined
  private handshake: TicketResidentClientHandshake | undefined
  private ledgerEpoch: string | undefined

  private constructor(options: TicketWorkspaceResidentClientOptions) {
    if (!Buffer.isBuffer(options.setupKey) || options.setupKey.byteLength !== 32) {
      throw new Error('Setup key must be exactly 32 bytes')
    }
    if (!validateTicketResidentBinding(options.expectedBinding)) {
      throw new Error('Expected service binding is invalid')
    }
    this.setupKey = Buffer.from(options.setupKey)
    this.expectedBinding = structuredClone(options.expectedBinding)
    this.now = options.now ?? (() => performance.now())
    this.randomBytes = options.randomBytes ?? ((size) => systemRandomBytes(size))
    this.reader = new TicketResidentByteStream(
      options.duplex,
      () => this.onStreamFailure(),
      () => this.state !== 'bound-idle' && this.state !== 'closed'
    )
    this.channel = new TicketResidentProtectedChannel(this.reader, this.now)
    this.readOperation = new TicketResidentReadOperation(
      this.reader,
      this.channel,
      this.snapshotResponse,
      this.now
    )
  }

  get connectionIncarnation(): string | undefined {
    return this.handshake?.context.connectionIncarnation
  }

  get boundLedgerEpoch(): string | undefined {
    return this.ledgerEpoch
  }

  get isRetired(): boolean {
    return this.state === 'closed'
  }

  async readSnapshot(signal?: AbortSignal): Promise<TicketResidentSnapshotResult> {
    if (this.state === 'read-in-flight' || this.state === 'admitting') {
      return { status: 'unavailable', reason: 'request_in_flight' }
    }
    if (this.state !== 'bound-idle' || !this.handshake || !this.ledgerEpoch) {
      return { status: 'unavailable', reason: this.reason ?? 'disconnected' }
    }
    if (signal?.aborted) {
      return { status: 'unavailable', reason: 'cancelled' }
    }
    this.state = 'read-in-flight'
    this.snapshotResponse.reset()
    try {
      const deadline = this.now() + READ_DEADLINE_MS
      const requestId = this.allocateRequestId()
      const remaining = this.remainingBudget(deadline, READ_DEADLINE_MS)
      const request = {
        type: 'snapshot.read' as const,
        requestId,
        profile: this.expectedBinding.profile,
        authorityId: this.expectedBinding.authorityId,
        ledgerEpoch: this.ledgerEpoch,
        deadlineBudgetMs: remaining
      }
      await this.channel.send(request, deadline)
      const result = await this.readOperation.run(
        requestId,
        deadline,
        signal,
        () => {
          this.state = 'admitting'
        },
        (reason) => this.retire(reason)
      )
      if (result.status === 'snapshot') {
        this.state = 'bound-idle'
        return result
      }
      if (!this.isRetired) {
        this.state = 'bound-idle'
      }
      return result
    } catch (error) {
      const reason = this.reasonFor(error)
      this.retire(reason)
      return { status: 'unavailable', reason }
    }
  }

  close(): void {
    this.retire('disconnected')
  }

  private async setupAndBind(): Promise<void> {
    const deadline = this.now() + SETUP_DEADLINE_MS
    const clientHello = createTicketResidentClientHello(
      this.setupKey,
      this.expectedBinding,
      this.randomBytes
    )
    const clientHelloFrame = encodeTicketResidentHelloFrame(clientHello)
    await this.reader.write(clientHelloFrame, deadline, this.now)

    const serverHelloFrame = await this.reader.readHelloFrame(deadline, this.now)
    const serverHelloValue = parseTicketResidentCanonicalJson(serverHelloFrame.body)
    if (
      this.reader.hasBytesInBatch(serverHelloFrame.deliveryBatchId) ||
      this.reader.hasBufferedBytes()
    ) {
      throw new Error('Unexpected data followed server hello')
    }
    const handshake = verifyTicketResidentServerHello(
      this.setupKey,
      this.expectedBinding,
      clientHello,
      serverHelloValue
    )
    this.handshake = handshake
    this.channel.setHandshake(handshake)
    this.state = 'authenticated-unbound'

    await this.reader.write(
      encodeTicketResidentHelloFrame(handshake.clientFinish),
      deadline,
      this.now
    )
    const bindBudget = this.remainingBudget(deadline, SETUP_DEADLINE_MS)
    const bindRequestId = this.allocateRequestId()
    const bindRequest = {
      type: 'source.bind' as const,
      requestId: bindRequestId,
      profile: this.expectedBinding.profile,
      authorityId: this.expectedBinding.authorityId,
      deadlineBudgetMs: bindBudget
    }
    await this.channel.send(bindRequest, deadline)
    const response = await this.channel.receive(deadline)
    if (response.message.type === 'error' && response.message.requestId === bindRequestId) {
      throw new Error(response.message.code)
    }
    if (
      response.message.type !== 'source.bound' ||
      response.message.requestId !== bindRequestId ||
      response.message.authorityId !== this.expectedBinding.authorityId ||
      this.reader.hasBytesInBatch(response.deliveryBatchId) ||
      this.reader.hasBufferedBytes()
    ) {
      throw new Error('Invalid source binding receipt')
    }
    if (this.now() >= deadline) {
      throw new Error('Deadline exceeded')
    }
    this.ledgerEpoch = response.message.ledgerEpoch
    this.state = 'bound-idle'
    this.setupKey.fill(0)
  }

  private allocateRequestId(): string {
    const value = this.randomBytes(16)
    if (!Buffer.isBuffer(value) || value.byteLength !== 16) {
      throw new Error('Random source returned an invalid request ID')
    }
    const requestId = value.toString('base64url')
    if (this.allocatedRequestIds.has(requestId)) {
      throw new Error('Request ID was reused')
    }
    this.allocatedRequestIds.add(requestId)
    return requestId
  }

  private remainingBudget(deadline: number, maximum: number): number {
    const budget = Math.min(maximum, Math.floor(deadline - this.now()))
    if (budget < 1) {
      throw new Error('Deadline exceeded')
    }
    return budget
  }

  private retire(reason: TicketResidentUnavailableReason): void {
    if (this.state === 'closed') {
      this.clearSecrets()
      this.reader.destroy()
      return
    }
    this.state = 'closed'
    this.reason = reason
    this.clearSecrets()
    this.reader.destroy()
  }

  private onStreamFailure(): void {
    this.state = 'closed'
    this.reason ??= 'disconnected'
    this.clearSecrets()
    this.reader.destroy()
  }

  private clearSecrets(): void {
    this.setupKey.fill(0)
    this.handshake?.c2sKey.fill(0)
    this.handshake?.s2cKey.fill(0)
  }

  private reasonFor(error: unknown): TicketResidentUnavailableReason {
    if (error instanceof Error && isUnavailableReason(error.message)) {
      return error.message
    }
    if (error instanceof Error && error.message === 'Deadline exceeded') {
      return 'deadline_exceeded'
    }
    if (error instanceof Error && /ended|closed|Duplex|stream/i.test(error.message)) {
      return 'disconnected'
    }
    return 'invalid_protocol'
  }
}

function isUnavailableReason(value: string): value is TicketResidentUnavailableReason {
  return (
    value === 'binding_mismatch' ||
    value === 'authority_rebind_required' ||
    value === 'source_unavailable' ||
    value === 'snapshot_too_large' ||
    value === 'deadline_exceeded' ||
    value === 'cancelled' ||
    value === 'disconnected' ||
    value === 'invalid_protocol' ||
    value === 'request_in_flight'
  )
}
