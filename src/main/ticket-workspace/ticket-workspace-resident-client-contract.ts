import type { Duplex } from 'node:stream'
import type {
  TicketResidentBinding,
  TicketResidentWireErrorCode
} from './ticket-workspace-resident-protocol'

export type TicketResidentUnavailableReason =
  | TicketResidentWireErrorCode
  | 'cancelled'
  | 'deadline_exceeded'
  | 'disconnected'
  | 'invalid_deadline_budget'
  | 'invalid_protocol'
  | 'request_in_flight'

export type TicketResidentSnapshotResult =
  | { status: 'snapshot'; snapshotBytes: Buffer }
  | { status: 'unavailable'; reason: TicketResidentUnavailableReason }

export type TicketWorkspaceResidentClientOptions = {
  duplex: Duplex
  setupKey: Buffer
  expectedBinding: TicketResidentBinding
  setupBudgetMs?: number
  expectLaunchReady?: boolean
  now?: () => number
  randomBytes?: (size: number) => Buffer
}
