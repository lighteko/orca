import type { Duplex } from 'node:stream'
import type {
  TicketWorkspaceOwnerSourcePort,
  CurrentTicketOwnerRead
} from './ticket-workspace-resident-source-port'
import type {
  TicketResidentUnavailableReason,
  TicketWorkspaceResidentClientOptions
} from './ticket-workspace-resident-client-contract'
import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'
import type { TicketWorkspaceResidentSourceClock } from './ticket-workspace-resident-source-clock'
import type { TicketWorkspaceResidentHighWater } from './ticket-workspace-resident-high-water'

export type TicketWorkspaceResidentSourceAdapterOptions = Readonly<{
  duplex: Duplex
  setupKey: Buffer
  expectedBinding: TicketResidentBinding
  highWater: TicketWorkspaceResidentHighWater
  clock: TicketWorkspaceResidentSourceClock
  getDisplayedSnapshotRevision(): string | null
  randomBytes?: TicketWorkspaceResidentClientOptions['randomBytes']
}>

export type TicketWorkspaceResidentSourceConnectResult =
  | { status: 'connected'; source: TicketWorkspaceResidentSourceAdapter }
  | { status: 'unavailable'; reason: TicketResidentUnavailableReason }

export type TicketWorkspaceResidentSourceAdapter = TicketWorkspaceOwnerSourcePort &
  Readonly<{
    close(): void
    presentSnapshot(read: CurrentTicketOwnerRead): boolean
  }>
