import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type { TicketWorkspaceResidentClient } from './ticket-workspace-resident-client'
import {
  issueTicketWorkspaceCurrentnessToken,
  type CurrentTicketOwnerRead
} from './ticket-workspace-resident-source-port'
import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'
import { connectResidentSourceAdapterAfterSetup } from './ticket-workspace-resident-source-adapter-connection'
import { admitTicketWorkspaceResidentSnapshot } from './ticket-workspace-resident-admission'
import { waitForResidentSourceAdmission } from './ticket-workspace-resident-source-admission-wait'
import { ResidentSourceCurrentness } from './ticket-workspace-resident-source-currentness'
import { ResidentSourceClockMonitor } from './ticket-workspace-resident-source-clock'
import {
  createResidentSourceHighWaterKey,
  type TicketWorkspaceResidentHighWater
} from './ticket-workspace-resident-high-water'
import {
  freezeResidentValue,
  residentHighWaterRecordFromSnapshot
} from './ticket-workspace-resident-source-values'
import type {
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
    if (
      this.isClosed ||
      this.client.isRetired ||
      !Number.isSafeInteger(deadlineBudgetMs) ||
      deadlineBudgetMs < 1 ||
      deadlineBudgetMs > 10_000
    ) {
      this.retireIfClientClosed()
      return null
    }
    const clockAtStart = this.clock.observe()
    if (clockAtStart.anomaly) {
      this.highWater.invalidateLease(this.key, this.leaseGeneration)
      return null
    }
    const readStartedAtMonotonicMs = clockAtStart.now
    const operationDeadlineAt = readStartedAtMonotonicMs + deadlineBudgetMs
    const boundEpochAtStart = this.client.boundLedgerEpoch
    const incarnationAtStart = this.client.connectionIncarnation
    if (
      boundEpochAtStart !== this.ledgerEpoch ||
      incarnationAtStart !== this.connectionIncarnation
    ) {
      await waitForResidentSourceAdmission(
        this.highWater.quarantine(this.key, 'binding_mismatch'),
        signal,
        this.currentness.remainingOperationBudget(operationDeadlineAt),
        () => undefined
      )
      this.retireLease()
      return null
    }

    const clientReadBudget = this.currentness.remainingOperationBudget(operationDeadlineAt)
    if (clientReadBudget < 1 || signal.aborted) {
      return null
    }
    const result = await this.client.readSnapshot(signal, clientReadBudget)
    if (result.status !== 'snapshot') {
      if (this.client.isRetired) {
        this.retireLease()
      } else {
        this.highWater.invalidateLease(this.key, this.leaseGeneration)
      }
      return null
    }
    if (
      signal.aborted ||
      this.client.isRetired ||
      this.client.boundLedgerEpoch !== boundEpochAtStart ||
      this.client.connectionIncarnation !== incarnationAtStart
    ) {
      this.retireLease()
      return null
    }

    const snapshotBytes = Buffer.from(result.snapshotBytes)
    if (
      !this.currentness.isReadAdmissible(
        signal,
        clockAtStart,
        readStartedAtMonotonicMs,
        operationDeadlineAt
      )
    ) {
      this.highWater.invalidateLease(this.key, this.leaseGeneration)
      return null
    }
    const admission = admitTicketWorkspaceResidentSnapshot(
      snapshotBytes,
      this.expectedBinding,
      boundEpochAtStart
    )
    if (admission.status !== 'accepted') {
      if (admission.status === 'rejected' && admission.reason === 'binding_mismatch') {
        await waitForResidentSourceAdmission(
          this.highWater.quarantine(this.key, 'binding_mismatch'),
          signal,
          this.currentness.remainingOperationBudget(operationDeadlineAt),
          () => undefined
        )
      } else {
        this.highWater.invalidateLease(this.key, this.leaseGeneration)
      }
      return null
    }

    const sourceRecord = residentHighWaterRecordFromSnapshot(admission.snapshot)
    let admissionAbandoned = false
    const highWaterOperation = this.highWater.admit(
      this.key,
      sourceRecord,
      this.leaseGeneration,
      () =>
        !admissionAbandoned &&
        this.currentness.isReadAdmissible(
          signal,
          clockAtStart,
          readStartedAtMonotonicMs,
          operationDeadlineAt
        )
    )
    const highWaterAdmission = await waitForResidentSourceAdmission(
      highWaterOperation,
      signal,
      this.currentness.remainingOperationBudget(operationDeadlineAt),
      () => {
        admissionAbandoned = true
      }
    )
    if (!highWaterAdmission || highWaterAdmission.status !== 'admitted') {
      this.highWater.invalidateLease(this.key, this.leaseGeneration)
      return null
    }
    if (
      this.isClosed ||
      this.client.isRetired ||
      this.client.boundLedgerEpoch !== boundEpochAtStart ||
      this.client.connectionIncarnation !== incarnationAtStart
    ) {
      this.retireLease()
      return null
    }
    if (
      !this.currentness.isReadAdmissible(
        signal,
        clockAtStart,
        readStartedAtMonotonicMs,
        operationDeadlineAt
      ) ||
      !this.highWater.isCurrent(highWaterAdmission.facts)
    ) {
      this.highWater.invalidateLease(this.key, this.leaseGeneration)
      return null
    }

    const snapshot = freezeResidentValue(structuredClone(admission.snapshot))
    const read = Object.freeze({
      snapshot,
      evidence: Object.freeze({
        binding: freezeResidentValue(structuredClone(this.expectedBinding)),
        ledgerEpoch: boundEpochAtStart,
        connectionIncarnation: incarnationAtStart,
        readStartedAtMonotonicMs,
        source: snapshot.source,
        currentnessToken: issueTicketWorkspaceCurrentnessToken()
      })
    })
    if (
      !this.currentness.isReadAdmissible(
        signal,
        clockAtStart,
        readStartedAtMonotonicMs,
        operationDeadlineAt
      ) ||
      !this.highWater.isCurrent(highWaterAdmission.facts)
    ) {
      this.highWater.invalidateLease(this.key, this.leaseGeneration)
      return null
    }
    this.currentness.issue(read, highWaterAdmission.facts, readStartedAtMonotonicMs, clockAtStart)
    return read
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

  private retireIfClientClosed(): void {
    if (this.client.isRetired) {
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
