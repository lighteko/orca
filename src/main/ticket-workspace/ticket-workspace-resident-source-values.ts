import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type { ResidentSourceHighWaterRecord } from './ticket-workspace-resident-high-water'

export function residentHighWaterRecordFromSnapshot(
  snapshot: TicketNavigatorSnapshotV1
): ResidentSourceHighWaterRecord {
  return Object.freeze({
    ledgerRevision: snapshot.source.ledgerRevision,
    projectionSequence: snapshot.source.projectionSequence,
    catalogDigest: snapshot.source.catalogDigest
  })
}

export function freezeResidentValue<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) {
      freezeResidentValue(child)
    }
  }
  return value
}
