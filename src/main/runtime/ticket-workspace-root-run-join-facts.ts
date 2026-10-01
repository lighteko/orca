import { isDeepStrictEqual } from 'node:util'
import type {
  TicketNavigatorSnapshotV1,
  WorkspaceRefV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { WorkerTerminalHostScope } from '../../shared/worker-terminal-host-scope'
import type {
  CurrentTicketOwnerRead,
  TicketWorkspaceOwnerSourcePort
} from '../ticket-workspace/ticket-workspace-resident-source-port'
import type { WorktreeCatalogBindingRequest } from '../persistence/loading-store/worktree-catalog-binding-types'
import type {
  TicketWorkspaceRootRunAttestationResultV1,
  TicketWorkspaceRootRunRuntimeFactsV1
} from './ticket-workspace-root-run-attestation'
import type { ExactLocalNativeGitWorktreeBinding } from './runtime-worktree-catalog-binding'
import {
  isAdmittedCurrentOwnerRead,
  sameOwnerReadFacts,
  sameSelectedOwnerFacts,
  selectEligibleTicketWorkspaceOwnerMapping
} from './ticket-workspace-live-owner-composition-policy'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'

export type TicketWorkspaceRootRunHostScopeMapV1 = (
  orchestrationExecutionHostId: string
) => WorkerTerminalHostScope | null

export type TicketWorkspaceRootRunJoinFactsV1 = Readonly<{
  ticket: TicketNavigatorSnapshotV1['tickets'][number]
  mapping: NonNullable<ReturnType<typeof selectEligibleTicketWorkspaceOwnerMapping>>
  coordinatorTarget: Extract<WorkspaceRefV1, { kind: 'git-worktree' }>
  request: WorktreeCatalogBindingRequest
  hostScope: WorkerTerminalHostScope
}>

export type TicketWorkspaceRootRunJoinAttemptV1 = Readonly<{
  rootFacts: TicketWorkspaceRootRunRuntimeFactsV1
  baseline: TicketNavigatorSnapshotV1
  firstRead: CurrentTicketOwnerRead
  secondRead: CurrentTicketOwnerRead
  presentedRead?: CurrentTicketOwnerRead
  firstFacts: TicketWorkspaceRootRunJoinFactsV1
  secondFacts: TicketWorkspaceRootRunJoinFactsV1
  binding: ExactLocalNativeGitWorktreeBinding
  selectedRepositoryBinding?: ExactLocalNativeGitWorktreeBinding
}>

export type TicketWorkspaceRootRunJoinCandidateV1 = Readonly<{
  verdict: 'available'
  displayedSnapshotRevision: string
  ticketKey: string
  repositoryId: string
  runId: string
  consumerGeneration: number
  coordinatorTarget: Readonly<Extract<WorkspaceRefV1, { kind: 'git-worktree' }>>
  repositoryTarget: Readonly<Extract<WorkspaceRefV1, { kind: 'git-worktree' }>>
}>

export function readTicketWorkspaceRootRunJoinFactsV1(
  snapshot: TicketNavigatorSnapshotV1,
  selection: TicketWorkspaceOwnerSelection,
  rootFacts: TicketWorkspaceRootRunRuntimeFactsV1,
  mapOrchestrationHostScope: TicketWorkspaceRootRunHostScopeMapV1
): TicketWorkspaceRootRunJoinFactsV1 | null {
  const tickets = snapshot.tickets.filter((ticket) => ticket.ticketKey === selection.ticketKey)
  const ticket = tickets[0]
  const mapping = selectEligibleTicketWorkspaceOwnerMapping(snapshot, selection)
  const target = ticket?.coordinatorTarget
  if (
    tickets.length !== 1 ||
    !ticket ||
    !mapping ||
    !target ||
    target.kind !== 'git-worktree' ||
    target.schemaVersion !== 1 ||
    target.executionHostId !== LOCAL_EXECUTION_HOST_ID ||
    target.worktreeId !== rootFacts.worktreeId ||
    ticket.orchestration.runId !== rootFacts.runId
  ) {
    return null
  }

  let hostScope: WorkerTerminalHostScope | null
  try {
    hostScope = mapOrchestrationHostScope(ticket.orchestration.executionHostId)
  } catch {
    return null
  }
  if (!hostScope || !isDeepStrictEqual(hostScope, rootFacts.hostScope)) {
    return null
  }

  const request: WorktreeCatalogBindingRequest = Object.freeze({
    repositoryId: target.repoId,
    worktreeId: target.worktreeId,
    executionHostId: target.executionHostId,
    instanceId: target.instanceId,
    identityKey: target.identityKey
  })
  return Object.freeze({ ticket, mapping, coordinatorTarget: target, request, hostScope })
}

export function sameTicketWorkspaceOwnerFactsV1(
  leftSnapshot: TicketNavigatorSnapshotV1,
  leftFacts: TicketWorkspaceRootRunJoinFactsV1,
  rightRead: CurrentTicketOwnerRead,
  rightFacts: TicketWorkspaceRootRunJoinFactsV1,
  selection: TicketWorkspaceOwnerSelection
): boolean {
  return (
    sameSelectedOwnerFacts(leftSnapshot, rightRead.snapshot, selection) &&
    isDeepStrictEqual(leftSnapshot.source, rightRead.snapshot.source) &&
    sameTicketRunCoordinatorFactsV1(leftFacts.ticket, rightFacts.ticket) &&
    isDeepStrictEqual(leftFacts.hostScope, rightFacts.hostScope) &&
    isDeepStrictEqual(leftFacts.mapping.workspaceRef, rightFacts.mapping.workspaceRef)
  )
}

export function sameTicketRunCoordinatorFactsV1(
  left: TicketNavigatorSnapshotV1['tickets'][number],
  right: TicketNavigatorSnapshotV1['tickets'][number]
): boolean {
  return (
    left.ticketKey === right.ticketKey &&
    left.availability === right.availability &&
    left.lifecycle === right.lifecycle &&
    isDeepStrictEqual(left.orchestration, right.orchestration) &&
    isDeepStrictEqual(left.coordinatorTarget, right.coordinatorTarget)
  )
}

export function isExactCoordinatorBindingV1(
  binding: ExactLocalNativeGitWorktreeBinding,
  facts: TicketWorkspaceRootRunJoinFactsV1
): boolean {
  const repo = binding.target.repo
  return (
    repo !== undefined &&
    isDeepStrictEqual(binding.request, facts.request) &&
    binding.target.executionHostId === LOCAL_EXECUTION_HOST_ID &&
    repo.id === facts.coordinatorTarget.repoId &&
    binding.target.worktree.id === facts.coordinatorTarget.worktreeId &&
    binding.target.worktree.instanceId === facts.coordinatorTarget.instanceId &&
    binding.target.worktree.identity?.key === facts.coordinatorTarget.identityKey
  )
}

export function isExactRepositoryBindingV1(
  binding: ExactLocalNativeGitWorktreeBinding,
  mapping: TicketWorkspaceRootRunJoinFactsV1['mapping']
): boolean {
  const target = mapping.workspaceRef
  return (
    target.kind === 'git-worktree' &&
    isDeepStrictEqual(binding.request, mapping.request) &&
    binding.target.executionHostId === target.executionHostId &&
    binding.target.repo?.id === target.repoId &&
    binding.target.worktree.id === target.worktreeId &&
    binding.target.worktree.instanceId === target.instanceId &&
    binding.target.worktree.identity?.key === target.identityKey
  )
}

export function readRootRunFactsV1(
  readFacts: () => TicketWorkspaceRootRunAttestationResultV1
): TicketWorkspaceRootRunRuntimeFactsV1 | null {
  try {
    const result = readFacts()
    return result.verdict === 'available' ? result.facts : null
  } catch {
    return null
  }
}

export function finalizeTicketWorkspaceRootRunJoinV1(
  attempt: TicketWorkspaceRootRunJoinAttemptV1,
  input: Readonly<{
    sourcePort: TicketWorkspaceOwnerSourcePort
    readRootRunFacts(): TicketWorkspaceRootRunAttestationResultV1
    mapOrchestrationHostScope: TicketWorkspaceRootRunHostScopeMapV1
    selection: TicketWorkspaceOwnerSelection
    checkOriginalOperation(): boolean
    finalizeAdditionalBindings?(): boolean
  }>
): TicketWorkspaceRootRunJoinCandidateV1 | null {
  if (!input.checkOriginalOperation()) {
    return null
  }
  const finalRootFacts = readRootRunFactsV1(input.readRootRunFacts)
  if (!finalRootFacts || !sameRootRunFactsV1(attempt.rootFacts, finalRootFacts)) {
    return null
  }
  const finalFacts = readTicketWorkspaceRootRunJoinFactsV1(
    attempt.secondRead.snapshot,
    input.selection,
    finalRootFacts,
    input.mapOrchestrationHostScope
  )
  if (
    !finalFacts ||
    !sameTicketRunCoordinatorFactsV1(attempt.firstFacts.ticket, finalFacts.ticket) ||
    !sameTicketRunCoordinatorFactsV1(attempt.secondFacts.ticket, finalFacts.ticket) ||
    !isDeepStrictEqual(attempt.secondFacts.hostScope, finalFacts.hostScope)
  ) {
    return null
  }

  const baseline = readDisplayedBaselineV1(input.sourcePort, input.selection)
  const baselineFacts = baseline
    ? readTicketWorkspaceRootRunJoinFactsV1(
        baseline,
        input.selection,
        finalRootFacts,
        input.mapOrchestrationHostScope
      )
    : null
  if (
    !baseline ||
    !baselineFacts ||
    !sameTicketWorkspaceOwnerFactsV1(
      baseline,
      baselineFacts,
      attempt.secondRead,
      finalFacts,
      input.selection
    ) ||
    !isCurrentOwnerReadV1(input.sourcePort, attempt.firstRead) ||
    !isCurrentOwnerReadV1(input.sourcePort, attempt.secondRead) ||
    (attempt.presentedRead !== undefined &&
      (!isCurrentOwnerReadV1(input.sourcePort, attempt.presentedRead) ||
        !sameOwnerReadFacts(attempt.presentedRead, attempt.firstRead, input.selection))) ||
    !sameOwnerReadFacts(attempt.firstRead, attempt.secondRead, input.selection) ||
    !input.checkOriginalOperation()
  ) {
    return null
  }

  const repositoryTarget = finalFacts.mapping.workspaceRef
  if (repositoryTarget.kind !== 'git-worktree') {
    return null
  }

  const candidate = Object.freeze({
    verdict: 'available',
    displayedSnapshotRevision: input.selection.snapshotRevision,
    ticketKey: input.selection.ticketKey,
    repositoryId: input.selection.repositoryId,
    runId: finalRootFacts.runId,
    consumerGeneration: finalRootFacts.consumerGeneration,
    coordinatorTarget: Object.freeze({ ...finalFacts.coordinatorTarget }),
    repositoryTarget: Object.freeze({ ...repositoryTarget })
  })
  if (input.finalizeAdditionalBindings) {
    try {
      if (!input.finalizeAdditionalBindings() || !input.checkOriginalOperation()) {
        return null
      }
    } catch {
      return null
    }
  }
  return candidate
}

export function readDisplayedBaselineV1(
  sourcePort: TicketWorkspaceOwnerSourcePort,
  selection: TicketWorkspaceOwnerSelection
): TicketNavigatorSnapshotV1 | null {
  try {
    const baseline = sourcePort.getDisplayedBaseline(selection.snapshotRevision)
    return baseline?.snapshotRevision === selection.snapshotRevision ? baseline : null
  } catch {
    return null
  }
}

function isCurrentOwnerReadV1(
  sourcePort: TicketWorkspaceOwnerSourcePort,
  read: CurrentTicketOwnerRead
): boolean {
  try {
    return isAdmittedCurrentOwnerRead(read) && sourcePort.isCurrent(read)
  } catch {
    return false
  }
}

function sameRootRunFactsV1(
  left: TicketWorkspaceRootRunRuntimeFactsV1,
  right: TicketWorkspaceRootRunRuntimeFactsV1
): boolean {
  return (
    left.runtimeId === right.runtimeId &&
    left.runId === right.runId &&
    left.consumerGeneration === right.consumerGeneration &&
    left.paneKey === right.paneKey &&
    left.terminalHandle === right.terminalHandle &&
    left.processIncarnation === right.processIncarnation &&
    left.worktreeId === right.worktreeId &&
    isDeepStrictEqual(left.hostScope, right.hostScope)
  )
}
