import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'

const ticketWorkspaceCurrentnessTokenBrand: unique symbol = Symbol('ticket-workspace-currentness')
const issuedCurrentnessTokens = new WeakSet<object>()

export type TicketWorkspaceCurrentnessToken = Readonly<{
  readonly [ticketWorkspaceCurrentnessTokenBrand]: true
}>

export function issueTicketWorkspaceCurrentnessToken(): TicketWorkspaceCurrentnessToken {
  const token = Object.freeze({ [ticketWorkspaceCurrentnessTokenBrand]: true as const })
  issuedCurrentnessTokens.add(token)
  return token
}

export function isTicketWorkspaceCurrentnessToken(
  value: unknown
): value is TicketWorkspaceCurrentnessToken {
  return typeof value === 'object' && value !== null && issuedCurrentnessTokens.has(value)
}

export type CurrentTicketOwnerRead = Readonly<{
  snapshot: TicketNavigatorSnapshotV1
  evidence: Readonly<{
    binding: TicketResidentBinding
    ledgerEpoch: string
    connectionIncarnation: string
    readStartedAtMonotonicMs: number
    source: TicketNavigatorSnapshotV1['source']
    currentnessToken: TicketWorkspaceCurrentnessToken
  }>
}>

export type TicketWorkspaceOwnerSourcePort = Readonly<{
  readCurrentSnapshot(
    signal: AbortSignal,
    deadlineBudgetMs: number
  ): Promise<CurrentTicketOwnerRead | null>
  isCurrent(read: CurrentTicketOwnerRead): boolean
  getDisplayedBaseline(snapshotRevision: string): TicketNavigatorSnapshotV1 | null
}>
