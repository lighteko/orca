import type {
  TicketNavigatorSnapshotV1,
  WorkspaceRefV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { WorktreeCatalogBindingRequest } from '../persistence/loading-store/worktree-catalog-binding-types'

export type TicketWorkspaceOwnerSelector = Readonly<{
  ticketKey: string
  repositoryId: string
}>

export type TicketWorkspaceOwnerSelection = Readonly<{
  snapshotRevision: string
  ticketKey: string
  repositoryId: string
}>

export type TicketWorkspaceOwnerMappingAttempt = Readonly<{
  status: 'mapped'
  snapshotRevision: string
  ticketKey: string
  repositoryId: string
  source: Readonly<{
    authorityId: string
    ledgerEpoch: string
    ledgerRevision: number
    projectionSequence: number
    catalogDigest: string
  }>
  workspaceRef: Readonly<WorkspaceRefV1>
  request: Readonly<WorktreeCatalogBindingRequest>
}>

export type TicketWorkspaceOwnerMappingUnavailable = Readonly<{
  status: 'unavailable'
  snapshotRevision: string
  ticketKey: string
  repositoryId: string
}>

export type TicketWorkspaceOwnerMappingResult =
  | TicketWorkspaceOwnerMappingAttempt
  | TicketWorkspaceOwnerMappingUnavailable

export function selectTicketWorkspaceOwnerMapping(
  snapshot: TicketNavigatorSnapshotV1,
  selector: TicketWorkspaceOwnerSelector
): TicketWorkspaceOwnerMappingResult {
  const unavailable = (): TicketWorkspaceOwnerMappingUnavailable =>
    Object.freeze({
      status: 'unavailable',
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: selector.ticketKey,
      repositoryId: selector.repositoryId
    })

  if (!isNonEmptyString(selector.ticketKey) || !isNonEmptyString(selector.repositoryId)) {
    return unavailable()
  }

  const tickets = snapshot.tickets.filter((ticket) => ticket.ticketKey === selector.ticketKey)
  if (tickets.length !== 1) {
    return unavailable()
  }
  const ticket = tickets[0]
  if (!ticket) {
    return unavailable()
  }

  const workspaces = ticket.workspaces.filter(
    (workspace) => workspace.repositoryId === selector.repositoryId
  )
  if (workspaces.length !== 1) {
    return unavailable()
  }
  const workspace = workspaces[0]
  const target = workspace?.target
  if (
    !target ||
    target.kind !== 'git-worktree' ||
    target.schemaVersion !== 1 ||
    target.executionHostId !== LOCAL_EXECUTION_HOST_ID ||
    workspace.repositoryId !== target.repoId ||
    !isNonEmptyString(target.worktreeId) ||
    !isNonEmptyString(target.instanceId) ||
    !isNonEmptyString(target.identityKey)
  ) {
    return unavailable()
  }

  const workspaceRef = Object.freeze({ ...target })
  const request = Object.freeze({
    repositoryId: workspace.repositoryId,
    worktreeId: target.worktreeId,
    executionHostId: target.executionHostId,
    instanceId: target.instanceId,
    identityKey: target.identityKey
  })
  const source = Object.freeze({
    authorityId: snapshot.source.authorityId,
    ledgerEpoch: snapshot.source.ledgerEpoch,
    ledgerRevision: snapshot.source.ledgerRevision,
    projectionSequence: snapshot.source.projectionSequence,
    catalogDigest: snapshot.source.catalogDigest
  })

  return Object.freeze({
    status: 'mapped',
    snapshotRevision: snapshot.snapshotRevision,
    ticketKey: ticket.ticketKey,
    repositoryId: workspace.repositoryId,
    source,
    workspaceRef,
    request
  })
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0
}
