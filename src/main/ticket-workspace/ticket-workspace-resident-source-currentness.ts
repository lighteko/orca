import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  isTicketWorkspaceCurrentnessToken,
  type CurrentTicketOwnerRead,
  type TicketWorkspaceCurrentnessToken
} from './ticket-workspace-resident-source-port'
import type { TicketWorkspaceResidentClient } from './ticket-workspace-resident-client'
import type {
  ResidentSourceClockMonitor,
  ResidentSourceClockObservation
} from './ticket-workspace-resident-source-clock'
import type {
  ResidentHighWaterFacts,
  TicketWorkspaceResidentHighWater
} from './ticket-workspace-resident-high-water'

const OWNER_CURRENTNESS_TTL_MS = 30_000

type CurrentnessFacts = Readonly<{
  read: CurrentTicketOwnerRead
  highWater: ResidentHighWaterFacts
  readStartedAtMonotonicMs: number
  suspendGeneration: number
  clockGeneration: number
}>

export class ResidentSourceCurrentness {
  private readonly tokenFacts = new WeakMap<TicketWorkspaceCurrentnessToken, CurrentnessFacts>()
  private presentedRead: CurrentTicketOwnerRead | undefined

  constructor(
    private readonly client: TicketWorkspaceResidentClient,
    private readonly highWater: TicketWorkspaceResidentHighWater,
    private readonly clock: ResidentSourceClockMonitor,
    private readonly ledgerEpoch: string,
    private readonly connectionIncarnation: string,
    private readonly getDisplayedSnapshotRevision: () => string | null,
    private readonly retireLease: () => void
  ) {}

  issue(
    read: CurrentTicketOwnerRead,
    facts: ResidentHighWaterFacts,
    readStartedAtMonotonicMs: number,
    started: ResidentSourceClockObservation
  ): void {
    this.tokenFacts.set(
      read.evidence.currentnessToken,
      Object.freeze({
        read,
        highWater: facts,
        readStartedAtMonotonicMs,
        suspendGeneration: started.suspendGeneration,
        clockGeneration: started.clockGeneration
      })
    )
  }

  isCurrent(read: CurrentTicketOwnerRead): boolean {
    if (!isTicketWorkspaceCurrentnessToken(read.evidence.currentnessToken)) {
      return false
    }
    const facts = this.tokenFacts.get(read.evidence.currentnessToken)
    if (
      !facts ||
      facts.read !== read ||
      this.client.isRetired ||
      this.client.boundLedgerEpoch !== read.evidence.ledgerEpoch ||
      this.client.connectionIncarnation !== read.evidence.connectionIncarnation
    ) {
      this.retireIfClientClosed()
      return false
    }
    const now = this.clock.observe()
    if (
      now.anomaly ||
      now.clockGeneration !== facts.clockGeneration ||
      now.suspendGeneration !== facts.suspendGeneration ||
      now.now < facts.readStartedAtMonotonicMs ||
      now.now - facts.readStartedAtMonotonicMs >= OWNER_CURRENTNESS_TTL_MS
    ) {
      return false
    }
    return this.highWater.isCurrent(facts.highWater)
  }

  presentSnapshot(read: CurrentTicketOwnerRead): boolean {
    if (!this.isCurrent(read)) {
      return false
    }
    this.presentedRead = read
    return true
  }

  getDisplayedBaseline(snapshotRevision: string): TicketNavigatorSnapshotV1 | null {
    let displayedSnapshotRevision: string | null
    try {
      displayedSnapshotRevision = this.getDisplayedSnapshotRevision()
    } catch {
      return null
    }
    if (displayedSnapshotRevision !== snapshotRevision) {
      return null
    }
    const read = this.presentedRead
    return read?.snapshot.snapshotRevision === snapshotRevision && this.isCurrent(read)
      ? read.snapshot
      : null
  }

  isReadAdmissible(
    signal: AbortSignal,
    started: ResidentSourceClockObservation,
    readStartedAtMonotonicMs: number,
    operationDeadlineAt: number
  ): boolean {
    if (
      signal.aborted ||
      this.client.isRetired ||
      this.client.boundLedgerEpoch !== this.ledgerEpoch ||
      this.client.connectionIncarnation !== this.connectionIncarnation
    ) {
      return false
    }
    const finished = this.clock.observe()
    return (
      !finished.anomaly &&
      finished.clockGeneration === started.clockGeneration &&
      finished.suspendGeneration === started.suspendGeneration &&
      finished.now >= readStartedAtMonotonicMs &&
      finished.now - readStartedAtMonotonicMs < OWNER_CURRENTNESS_TTL_MS &&
      finished.now < operationDeadlineAt
    )
  }

  remainingOperationBudget(deadlineAt: number): number {
    const current = this.clock.observe()
    if (current.anomaly || !Number.isFinite(current.now)) {
      return 0
    }
    return Math.floor(Math.min(deadlineAt - current.now, OWNER_CURRENTNESS_TTL_MS))
  }

  private retireIfClientClosed(): void {
    if (this.client.isRetired) {
      this.retireLease()
    }
  }
}
