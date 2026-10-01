import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { admitTicketWorkspaceResidentSnapshot } from './ticket-workspace-resident-admission'
import type { TicketWorkspaceResidentClient } from './ticket-workspace-resident-client'
import { waitForResidentSourceAdmission } from './ticket-workspace-resident-source-admission-wait'
import type { ResidentSourceCurrentness } from './ticket-workspace-resident-source-currentness'
import type {
  ResidentSourceClockMonitor,
  ResidentSourceClockObservation
} from './ticket-workspace-resident-source-clock'
import { ResidentHighWaterOperationContext } from './ticket-workspace-resident-high-water-operation-context'
import type {
  ResidentHighWaterFacts,
  ResidentSourceHighWaterKey,
  TicketWorkspaceResidentHighWater
} from './ticket-workspace-resident-high-water'
import { residentHighWaterRecordFromSnapshot } from './ticket-workspace-resident-source-values'
import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'

export type ResidentSourcePresentationReadContext = Readonly<{
  signal: AbortSignal
  started: ResidentSourceClockObservation
  readStartedAtMonotonicMs: number
  operationDeadlineAt: number
  boundLedgerEpoch: string
  connectionIncarnation: string
  originalInvalidationGeneration: number
}>

export type ResidentSourcePresentationReadCandidate =
  | { status: 'unavailable' }
  | { status: 'unsupported'; context: ResidentSourcePresentationReadContext }
  | {
      status: 'admitted'
      context: ResidentSourcePresentationReadContext
      snapshot: TicketNavigatorSnapshotV1
      highWaterFacts: ResidentHighWaterFacts
    }

export type ResidentSourcePresentationReadDependencies = Readonly<{
  client: TicketWorkspaceResidentClient
  expectedBinding: TicketResidentBinding
  ledgerEpoch: string
  connectionIncarnation: string
  key: ResidentSourceHighWaterKey
  leaseGeneration: number
  highWater: TicketWorkspaceResidentHighWater
  clock: ResidentSourceClockMonitor
  currentness: ResidentSourceCurrentness
  isClosed(): boolean
  retireLease(): void
}>

export async function readResidentSourcePresentationCandidate(
  dependencies: ResidentSourcePresentationReadDependencies,
  signal: AbortSignal,
  deadlineBudgetMs: number
): Promise<ResidentSourcePresentationReadCandidate> {
  if (
    dependencies.isClosed() ||
    dependencies.client.isRetired ||
    !Number.isSafeInteger(deadlineBudgetMs) ||
    deadlineBudgetMs < 1 ||
    deadlineBudgetMs > 10_000
  ) {
    retireIfClientClosed(dependencies)
    return { status: 'unavailable' }
  }

  const { key, leaseGeneration } = dependencies
  const originalInvalidationGeneration = dependencies.highWater.captureLeaseInvalidationGeneration(
    key,
    leaseGeneration
  )
  if (originalInvalidationGeneration === null) {
    return { status: 'unavailable' }
  }

  const started = dependencies.clock.observe()
  if (started.anomaly) {
    dependencies.highWater.invalidateLease(key, leaseGeneration)
    return { status: 'unavailable' }
  }
  const readStartedAtMonotonicMs = started.now
  const operationDeadlineAt = readStartedAtMonotonicMs + deadlineBudgetMs
  const boundLedgerEpoch = dependencies.client.boundLedgerEpoch
  const connectionIncarnation = dependencies.client.connectionIncarnation

  if (
    boundLedgerEpoch !== dependencies.ledgerEpoch ||
    connectionIncarnation !== dependencies.connectionIncarnation
  ) {
    await waitForResidentSourceAdmission(
      dependencies.highWater.quarantine(key, 'binding_mismatch'),
      signal,
      dependencies.currentness.remainingOperationBudget(operationDeadlineAt),
      () => undefined
    )
    dependencies.retireLease()
    return { status: 'unavailable' }
  }

  const context: ResidentSourcePresentationReadContext = {
    signal,
    started,
    readStartedAtMonotonicMs,
    operationDeadlineAt,
    boundLedgerEpoch,
    connectionIncarnation,
    originalInvalidationGeneration
  }

  const clientReadBudget = dependencies.currentness.remainingOperationBudget(operationDeadlineAt)
  if (clientReadBudget < 1 || signal.aborted) {
    return { status: 'unavailable' }
  }
  const result = await dependencies.client.readSnapshot(signal, clientReadBudget)
  if (result.status !== 'snapshot') {
    if (dependencies.client.isRetired) {
      dependencies.retireLease()
    } else {
      dependencies.highWater.invalidateLease(key, leaseGeneration)
    }
    return { status: 'unavailable' }
  }
  if (
    signal.aborted ||
    dependencies.client.isRetired ||
    dependencies.client.boundLedgerEpoch !== boundLedgerEpoch ||
    dependencies.client.connectionIncarnation !== connectionIncarnation
  ) {
    dependencies.retireLease()
    return { status: 'unavailable' }
  }

  const snapshotBytes = Buffer.from(result.snapshotBytes)
  if (!isOriginalReadCurrent(dependencies, context)) {
    dependencies.highWater.invalidateLease(key, leaseGeneration)
    return { status: 'unavailable' }
  }
  if (
    !dependencies.highWater.isLeaseCurrent(key, leaseGeneration, originalInvalidationGeneration)
  ) {
    return { status: 'unavailable' }
  }

  const admission = admitTicketWorkspaceResidentSnapshot(
    snapshotBytes,
    dependencies.expectedBinding,
    boundLedgerEpoch
  )
  if (admission.status === 'unsupported') {
    return { status: 'unsupported', context }
  }
  if (admission.status !== 'accepted') {
    if (admission.reason === 'binding_mismatch') {
      await waitForResidentSourceAdmission(
        dependencies.highWater.quarantine(key, 'binding_mismatch'),
        signal,
        dependencies.currentness.remainingOperationBudget(operationDeadlineAt),
        () => undefined
      )
    } else {
      dependencies.highWater.invalidateLease(key, leaseGeneration)
    }
    return { status: 'unavailable' }
  }

  const operationContext = new ResidentHighWaterOperationContext(
    signal,
    () => dependencies.currentness.remainingOperationBudget(operationDeadlineAt),
    () => dependencies.highWater.invalidateLease(key, leaseGeneration)
  )
  const highWaterOperation = dependencies.highWater.admit(
    key,
    residentHighWaterRecordFromSnapshot(admission.snapshot),
    leaseGeneration,
    () =>
      operationContext.isActive() &&
      isOriginalReadCurrent(dependencies, context) &&
      dependencies.highWater.isLeaseCurrent(key, leaseGeneration, originalInvalidationGeneration),
    operationContext
  )
  const highWaterAdmission = await waitForResidentSourceAdmission(
    highWaterOperation,
    signal,
    operationContext.remainingBudgetMs(),
    () => operationContext.abandon()
  ).finally(() => operationContext.dispose())
  if (
    highWaterAdmission?.status === 'unavailable' &&
    highWaterAdmission.reason === 'high_water_admission_capacity'
  ) {
    return { status: 'unavailable' }
  }
  if (!highWaterAdmission || highWaterAdmission.status !== 'admitted') {
    if (!operationContext.isAbandoned()) {
      dependencies.highWater.invalidateLease(key, leaseGeneration)
    }
    return { status: 'unavailable' }
  }
  return {
    status: 'admitted',
    context,
    snapshot: admission.snapshot,
    highWaterFacts: highWaterAdmission.facts
  }
}

function isOriginalReadCurrent(
  dependencies: ResidentSourcePresentationReadDependencies,
  context: ResidentSourcePresentationReadContext
): boolean {
  return (
    !dependencies.isClosed() &&
    !context.signal.aborted &&
    !dependencies.client.isRetired &&
    dependencies.client.boundLedgerEpoch === context.boundLedgerEpoch &&
    context.boundLedgerEpoch === dependencies.ledgerEpoch &&
    dependencies.client.connectionIncarnation === context.connectionIncarnation &&
    context.connectionIncarnation === dependencies.connectionIncarnation &&
    dependencies.currentness.isReadAdmissible(
      context.signal,
      context.started,
      context.readStartedAtMonotonicMs,
      context.operationDeadlineAt
    )
  )
}

function retireIfClientClosed(dependencies: ResidentSourcePresentationReadDependencies): void {
  if (dependencies.client.isRetired) {
    dependencies.retireLease()
  }
}
