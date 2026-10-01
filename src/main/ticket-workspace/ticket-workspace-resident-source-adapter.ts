import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type { TicketWorkspaceResidentClient } from './ticket-workspace-resident-client'
import {
  issueTicketWorkspaceCurrentnessToken,
  type CurrentTicketOwnerRead
} from './ticket-workspace-resident-source-port'
import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'
import { connectResidentSourceAdapterAfterSetup } from './ticket-workspace-resident-source-adapter-connection'
import { ResidentSourceCurrentness } from './ticket-workspace-resident-source-currentness'
import { ResidentSourceClockMonitor } from './ticket-workspace-resident-source-clock'
import {
  readResidentSourcePresentationCandidate,
  type ResidentSourcePresentationReadContext
} from './ticket-workspace-resident-source-presentation-read'
import {
  createResidentSourceHighWaterKey,
  type TicketWorkspaceResidentHighWater
} from './ticket-workspace-resident-high-water'
import { freezeResidentValue } from './ticket-workspace-resident-source-values'
import type {
  TicketWorkspaceResidentPresentationReadResult,
  TicketWorkspaceResidentSourceAdapter,
  TicketWorkspaceResidentSourceAdapterOptions,
  TicketWorkspaceResidentSourceConnectResult
} from './ticket-workspace-resident-source-adapter-contract'

export type {
  TicketWorkspaceResidentSourceAdapter,
  TicketWorkspaceResidentSourceAdapterOptions,
  TicketWorkspaceResidentSourceConnectResult
} from './ticket-workspace-resident-source-adapter-contract'
export type { TicketWorkspaceResidentSourceClock } from './ticket-workspace-resident-source-clock'

export async function connectTicketWorkspaceResidentSourceAdapter(
  options: TicketWorkspaceResidentSourceAdapterOptions
): Promise<TicketWorkspaceResidentSourceConnectResult> {
  const expectedBinding = freezeResidentValue(structuredClone(options.expectedBinding))
  const clock = new ResidentSourceClockMonitor(options.clock)
  return await connectResidentSourceAdapterAfterSetup(
    options,
    expectedBinding,
    clock,
    (client, binding, ledgerEpoch, connectionIncarnation) =>
      new ResidentSourceAdapter(
        client,
        binding,
        ledgerEpoch,
        connectionIncarnation,
        options.highWater,
        clock,
        options.getDisplayedSnapshotRevision
      )
  )
}

class ResidentSourceAdapter implements TicketWorkspaceResidentSourceAdapter {
  private readonly key: ReturnType<typeof createResidentSourceHighWaterKey>
  private readonly leaseGeneration: number
  private readonly currentness: ResidentSourceCurrentness
  private isClosed = false
  private hasRetiredLease = false

  constructor(
    private readonly client: TicketWorkspaceResidentClient,
    private readonly expectedBinding: TicketResidentBinding,
    private readonly ledgerEpoch: string,
    private readonly connectionIncarnation: string,
    private readonly highWater: TicketWorkspaceResidentHighWater,
    private readonly clock: ResidentSourceClockMonitor,
    getDisplayedSnapshotRevision: () => string | null
  ) {
    this.key = createResidentSourceHighWaterKey(expectedBinding, ledgerEpoch)
    const leaseIdentity = JSON.stringify([
      expectedBinding.expectedService.releaseId,
      expectedBinding.expectedService.artifactSha256,
      connectionIncarnation
    ])
    this.leaseGeneration = highWater.registerLease(this.key, leaseIdentity)
    this.clock.setOnAnomaly(() => this.highWater.invalidateLease(this.key, this.leaseGeneration))
    this.currentness = new ResidentSourceCurrentness(
      client,
      highWater,
      clock,
      ledgerEpoch,
      connectionIncarnation,
      getDisplayedSnapshotRevision,
      () => this.retireLease()
    )
    this.clock.observe()
  }

  async readCurrentSnapshot(
    signal: AbortSignal,
    deadlineBudgetMs: number
  ): Promise<CurrentTicketOwnerRead | null> {
    const result = await this.readCurrentPresentationSnapshot(signal, deadlineBudgetMs)
    if (
      result.status !== 'admitted' ||
      !this.currentness.isCurrentForOriginalOperation(
        result.read,
        signal,
        result.read.evidence.readStartedAtMonotonicMs + deadlineBudgetMs
      )
    ) {
      return null
    }
    return result.read
  }

  async readCurrentPresentationSnapshot(
    signal: AbortSignal,
    deadlineBudgetMs: number
  ): Promise<TicketWorkspaceResidentPresentationReadResult> {
    const candidate = await readResidentSourcePresentationCandidate(
      {
        client: this.client,
        expectedBinding: this.expectedBinding,
        ledgerEpoch: this.ledgerEpoch,
        connectionIncarnation: this.connectionIncarnation,
        key: this.key,
        leaseGeneration: this.leaseGeneration,
        highWater: this.highWater,
        clock: this.clock,
        currentness: this.currentness,
        isClosed: () => this.isClosed,
        retireLease: () => this.retireLease()
      },
      signal,
      deadlineBudgetMs
    )
    if (candidate.status === 'unavailable') {
      return { status: 'unavailable' }
    }
    if (candidate.status === 'unsupported') {
      if (
        !this.isOriginalReadCurrent(candidate.context) ||
        !this.highWater.isLeaseCurrent(
          this.key,
          this.leaseGeneration,
          candidate.context.originalInvalidationGeneration
        )
      ) {
        return { status: 'unavailable' }
      }
      this.highWater.invalidateLease(this.key, this.leaseGeneration)
      return { status: 'unsupported' }
    }

    if (!this.hasExactReadOwner(candidate.context)) {
      this.retireLease()
      return { status: 'unavailable' }
    }
    if (
      !this.isOriginalReadCurrent(candidate.context) ||
      !this.highWater.isCurrent(candidate.highWaterFacts)
    ) {
      this.highWater.invalidateLease(this.key, this.leaseGeneration)
      return { status: 'unavailable' }
    }
    const snapshot = freezeResidentValue(structuredClone(candidate.snapshot))
    const read = Object.freeze({
      snapshot,
      evidence: Object.freeze({
        binding: freezeResidentValue(structuredClone(this.expectedBinding)),
        ledgerEpoch: candidate.context.boundLedgerEpoch,
        connectionIncarnation: candidate.context.connectionIncarnation,
        readStartedAtMonotonicMs: candidate.context.readStartedAtMonotonicMs,
        source: snapshot.source,
        currentnessToken: issueTicketWorkspaceCurrentnessToken()
      })
    })
    if (
      !this.isOriginalReadCurrent(candidate.context) ||
      !this.highWater.isCurrent(candidate.highWaterFacts)
    ) {
      this.highWater.invalidateLease(this.key, this.leaseGeneration)
      return { status: 'unavailable' }
    }
    this.currentness.issue(
      read,
      candidate.highWaterFacts,
      candidate.context.readStartedAtMonotonicMs,
      candidate.context.started
    )
    const currentnessRemainingMs = this.currentness.getCurrentnessRemainingMs(read)
    if (
      !this.currentness.isCurrent(read) ||
      !this.isOriginalReadCurrent(candidate.context) ||
      !this.highWater.isCurrent(candidate.highWaterFacts)
    ) {
      return { status: 'unavailable' }
    }
    return {
      status: 'admitted',
      read,
      currentnessRemainingMs
    }
  }

  getCurrentnessRemainingMs(read: CurrentTicketOwnerRead): number {
    return this.currentness.getCurrentnessRemainingMs(read)
  }

  private hasExactReadOwner(context: ResidentSourcePresentationReadContext): boolean {
    if (
      this.isClosed ||
      context.signal.aborted ||
      this.client.isRetired ||
      this.client.boundLedgerEpoch !== context.boundLedgerEpoch ||
      context.boundLedgerEpoch !== this.ledgerEpoch ||
      this.client.connectionIncarnation !== context.connectionIncarnation ||
      context.connectionIncarnation !== this.connectionIncarnation
    ) {
      return false
    }
    return true
  }

  private isOriginalReadCurrent(context: ResidentSourcePresentationReadContext): boolean {
    return (
      this.hasExactReadOwner(context) &&
      this.currentness.isReadAdmissible(
        context.signal,
        context.started,
        context.readStartedAtMonotonicMs,
        context.operationDeadlineAt
      )
    )
  }

  isCurrent(read: CurrentTicketOwnerRead): boolean {
    return this.currentness.isCurrent(read)
  }

  presentSnapshot(read: CurrentTicketOwnerRead): boolean {
    return this.currentness.presentSnapshot(read)
  }

  getDisplayedBaseline(snapshotRevision: string): TicketNavigatorSnapshotV1 | null {
    return this.currentness.getDisplayedBaseline(snapshotRevision)
  }

  close(): void {
    if (!this.isClosed) {
      this.isClosed = true
      this.client.close()
      this.retireLease()
    }
  }

  private retireLease(): void {
    if (!this.hasRetiredLease) {
      this.hasRetiredLease = true
      this.highWater.retireLease(this.key, this.leaseGeneration)
    }
  }
}
