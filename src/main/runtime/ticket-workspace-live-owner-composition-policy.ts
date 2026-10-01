import { isDeepStrictEqual } from 'node:util'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  isTicketWorkspaceCurrentnessToken,
  type CurrentTicketOwnerRead
} from '../ticket-workspace/ticket-workspace-resident-source-port'
import {
  selectTicketWorkspaceOwnerMapping,
  type TicketWorkspaceOwnerMappingAttempt,
  type TicketWorkspaceOwnerSelection
} from './ticket-workspace-owner-selection'

export type EligibleTicketWorkspaceOwnerMapping = TicketWorkspaceOwnerMappingAttempt

export function selectEligibleTicketWorkspaceOwnerMapping(
  snapshot: TicketNavigatorSnapshotV1,
  selection: TicketWorkspaceOwnerSelection
): EligibleTicketWorkspaceOwnerMapping | null {
  if (snapshot.tickets.some((ticket) => ticket.availability === 'unsupported')) {
    return null
  }

  const tickets = snapshot.tickets.filter((ticket) => ticket.ticketKey === selection.ticketKey)
  const ticket = tickets[0]
  if (
    tickets.length !== 1 ||
    ticket?.availability !== 'available' ||
    ticket.lifecycle === 'tearing-down' ||
    ticket.lifecycle === 'removed'
  ) {
    return null
  }

  const workspaces = ticket.workspaces.filter(
    (workspace) => workspace.repositoryId === selection.repositoryId
  )
  const workspace = workspaces[0]
  if (
    workspaces.length !== 1 ||
    !workspace ||
    workspace.role === 'excluded' ||
    workspace.actualState === 'absent' ||
    workspace.actualState === 'removing'
  ) {
    return null
  }

  const mapping = selectTicketWorkspaceOwnerMapping(snapshot, selection)
  return mapping.status === 'mapped' ? mapping : null
}

export function isAdmittedCurrentOwnerRead(read: CurrentTicketOwnerRead): boolean {
  const { binding, connectionIncarnation, currentnessToken, ledgerEpoch, source } = read.evidence
  return (
    isTicketWorkspaceCurrentnessToken(currentnessToken) &&
    isNonEmptyString(connectionIncarnation) &&
    isNonEmptyString(ledgerEpoch) &&
    Number.isFinite(read.evidence.readStartedAtMonotonicMs) &&
    isDeepStrictEqual(read.snapshot.profile, binding.profile) &&
    read.snapshot.producer.name === binding.expectedService.producerName &&
    read.snapshot.producer.version === binding.expectedService.releaseId &&
    read.snapshot.source.authorityId === binding.authorityId &&
    read.snapshot.source.ledgerEpoch === ledgerEpoch &&
    isDeepStrictEqual(read.snapshot.source, source)
  )
}

export function sameOwnerLease(
  left: CurrentTicketOwnerRead,
  right: CurrentTicketOwnerRead
): boolean {
  return (
    isDeepStrictEqual(left.evidence.binding, right.evidence.binding) &&
    left.evidence.ledgerEpoch === right.evidence.ledgerEpoch &&
    left.evidence.connectionIncarnation === right.evidence.connectionIncarnation
  )
}

export function sameSelectedOwnerFacts(
  left: TicketNavigatorSnapshotV1,
  right: TicketNavigatorSnapshotV1,
  selection: TicketWorkspaceOwnerSelection
): boolean {
  const leftMapping = selectEligibleTicketWorkspaceOwnerMapping(left, selection)
  const rightMapping = selectEligibleTicketWorkspaceOwnerMapping(right, selection)
  if (!leftMapping || !rightMapping) {
    return false
  }

  const leftTicket = left.tickets.find((ticket) => ticket.ticketKey === selection.ticketKey)
  const rightTicket = right.tickets.find((ticket) => ticket.ticketKey === selection.ticketKey)
  const leftWorkspace = leftTicket?.workspaces.find(
    (workspace) => workspace.repositoryId === selection.repositoryId
  )
  const rightWorkspace = rightTicket?.workspaces.find(
    (workspace) => workspace.repositoryId === selection.repositoryId
  )
  return (
    isDeepStrictEqual(left.profile, right.profile) &&
    isDeepStrictEqual(leftMapping.source, rightMapping.source) &&
    isDeepStrictEqual(leftMapping.workspaceRef, rightMapping.workspaceRef) &&
    leftTicket?.availability === rightTicket?.availability &&
    leftTicket?.lifecycle === rightTicket?.lifecycle &&
    leftWorkspace?.role === rightWorkspace?.role &&
    leftWorkspace?.actualState === rightWorkspace?.actualState
  )
}

export function sameOwnerReadFacts(
  left: CurrentTicketOwnerRead,
  right: CurrentTicketOwnerRead,
  selection: TicketWorkspaceOwnerSelection
): boolean {
  return (
    sameOwnerLease(left, right) &&
    isDeepStrictEqual(left.snapshot.source, right.snapshot.source) &&
    sameSelectedOwnerFacts(left.snapshot, right.snapshot, selection)
  )
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0
}
