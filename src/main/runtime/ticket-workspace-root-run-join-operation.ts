import { isDeepStrictEqual } from 'node:util'
import type { CurrentTicketOwnerRead } from '../ticket-workspace/ticket-workspace-resident-source-port'
import type {
  ExactLocalNativeGitWorktreeBinding,
  RuntimeWorktreeCatalogBindingCommands
} from './runtime-worktree-catalog-binding'
import type { TicketWorkspaceOwnerOperationContext } from './ticket-workspace-live-owner-composition-operation'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'
import {
  finalizeTicketWorkspaceRootRunJoinV1,
  isExactCoordinatorBindingV1,
  isExactRepositoryBindingV1,
  readDisplayedBaselineV1,
  readRootRunFactsV1,
  readTicketWorkspaceRootRunJoinFactsV1,
  sameTicketRunCoordinatorFactsV1,
  sameTicketWorkspaceOwnerFactsV1,
  type TicketWorkspaceRootRunJoinAttemptV1,
  type TicketWorkspaceRootRunJoinCandidateV1
} from './ticket-workspace-root-run-join-facts'
import {
  isAdmittedCurrentOwnerRead,
  sameOwnerReadFacts
} from './ticket-workspace-live-owner-composition-policy'
import type { TicketWorkspaceRootRunJoinDependenciesV1 } from './ticket-workspace-root-run-join'

type BindingCommands = Pick<
  RuntimeWorktreeCatalogBindingCommands,
  'resolveExactLocalNativeGitTarget' | 'isExactLocalNativeGitBindingCurrent'
>

export type CommonJoinDependenciesV1 = Omit<
  TicketWorkspaceRootRunJoinDependenciesV1,
  'clock' | 'worktreeBindings'
> &
  Readonly<{
    worktreeBindings: BindingCommands &
      Pick<RuntimeWorktreeCatalogBindingCommands, 'isExactLocalNativeGitBindingCatalogCurrent'>
  }>

export type CommonJoinInputV1 = Readonly<{
  selection: TicketWorkspaceOwnerSelection
  presentedRead: CurrentTicketOwnerRead
  context: TicketWorkspaceOwnerOperationContext
  callerSignal: AbortSignal | undefined
}>

export type TicketWorkspaceRootRunCommonJoinCandidateV1 = Readonly<{
  rootRun: TicketWorkspaceRootRunJoinCandidateV1
  selectedRepositoryWorktreeId: string
}>

export type TicketWorkspaceRootRunCommonJoinWitnessV1 = Readonly<{
  finalize(): TicketWorkspaceRootRunCommonJoinCandidateV1 | null
}>

export type TicketWorkspaceRootRunJoinOperationCandidateV1 = Readonly<{
  rootRun: TicketWorkspaceRootRunJoinCandidateV1
  selectedRepositoryWorktreeId?: string
}>

export type TicketWorkspaceRootRunJoinOperationWitnessV1 = Readonly<{
  finalize(): TicketWorkspaceRootRunJoinOperationCandidateV1 | null
}>

export async function prepareTicketWorkspaceRootRunJoinOperationV1(
  dependencies: TicketWorkspaceRootRunJoinDependenciesV1 | CommonJoinDependenciesV1,
  input: Readonly<{
    selection: TicketWorkspaceOwnerSelection
    presentedRead?: CurrentTicketOwnerRead
    context: TicketWorkspaceOwnerOperationContext
    callerSignal: AbortSignal | undefined
    checkOriginalOperation(): boolean
  }>,
  includeSelectedRepository: boolean
): Promise<TicketWorkspaceRootRunJoinOperationWitnessV1 | null> {
  const { selection, context, checkOriginalOperation } = input
  if (
    (includeSelectedRepository &&
      !('isExactLocalNativeGitBindingCatalogCurrent' in dependencies.worktreeBindings)) ||
    !checkOriginalOperation()
  ) {
    return null
  }
  const rootFacts = readRootRunFactsV1(dependencies.readRootRunFacts)
  const baseline = rootFacts && readDisplayedBaselineV1(dependencies.sourcePort, selection)
  const baselineFacts =
    rootFacts && baseline
      ? readTicketWorkspaceRootRunJoinFactsV1(
          baseline,
          selection,
          rootFacts,
          dependencies.mapOrchestrationHostScope
        )
      : null
  if (!rootFacts || !baseline || !baselineFacts || !checkOriginalOperation()) {
    return null
  }

  const firstRead = await context.readCurrent()
  if (
    !firstRead ||
    !checkOriginalOperation() ||
    (input.presentedRead !== undefined &&
      (!isAdmittedCurrentOwnerRead(input.presentedRead) ||
        !dependencies.sourcePort.isCurrent(input.presentedRead) ||
        !sameOwnerReadFacts(input.presentedRead, firstRead, selection)))
  ) {
    return null
  }
  const firstFacts = readTicketWorkspaceRootRunJoinFactsV1(
    firstRead.snapshot,
    selection,
    rootFacts,
    dependencies.mapOrchestrationHostScope
  )
  if (
    !firstFacts ||
    !sameTicketWorkspaceOwnerFactsV1(baseline, baselineFacts, firstRead, firstFacts, selection)
  ) {
    return null
  }

  const resolved = await resolveBindings(
    dependencies.worktreeBindings,
    firstFacts.request,
    includeSelectedRepository ? firstFacts.mapping.request : undefined,
    context.signal
  )
  if (
    !resolved ||
    !checkOriginalOperation() ||
    !isExactCoordinatorBindingV1(resolved.coordinator, firstFacts) ||
    (includeSelectedRepository &&
      (!resolved.repository ||
        !isExactRepositoryBindingV1(resolved.repository, firstFacts.mapping)))
  ) {
    return null
  }
  if (!(await bindingsCurrent(dependencies.worktreeBindings, resolved, context.signal))) {
    return null
  }
  if (!checkOriginalOperation()) {
    return null
  }

  const secondRead = await context.readCurrent()
  if (!secondRead || !checkOriginalOperation()) {
    return null
  }
  const secondFacts = readTicketWorkspaceRootRunJoinFactsV1(
    secondRead.snapshot,
    selection,
    rootFacts,
    dependencies.mapOrchestrationHostScope
  )
  if (
    !secondFacts ||
    !sameTicketWorkspaceOwnerFactsV1(
      firstRead.snapshot,
      firstFacts,
      secondRead,
      secondFacts,
      selection
    ) ||
    (input.presentedRead !== undefined &&
      !sameOwnerReadFacts(input.presentedRead, secondRead, selection))
  ) {
    return null
  }
  if (!(await bindingsCurrent(dependencies.worktreeBindings, resolved, context.signal))) {
    return null
  }
  if (!checkOriginalOperation()) {
    return null
  }

  const terminalBaseline = readDisplayedBaselineV1(dependencies.sourcePort, selection)
  const terminalFacts = terminalBaseline
    ? readTicketWorkspaceRootRunJoinFactsV1(
        terminalBaseline,
        selection,
        rootFacts,
        dependencies.mapOrchestrationHostScope
      )
    : null
  if (
    !terminalBaseline ||
    !terminalFacts ||
    !sameTicketWorkspaceOwnerFactsV1(
      terminalBaseline,
      terminalFacts,
      secondRead,
      secondFacts,
      selection
    ) ||
    !sameTicketRunCoordinatorFactsV1(baselineFacts.ticket, secondFacts.ticket) ||
    !checkOriginalOperation()
  ) {
    return null
  }

  const attempt: TicketWorkspaceRootRunJoinAttemptV1 = Object.freeze({
    rootFacts,
    baseline,
    firstRead,
    secondRead,
    ...(input.presentedRead ? { presentedRead: input.presentedRead } : {}),
    firstFacts,
    secondFacts,
    binding: resolved.coordinator,
    ...(resolved.repository ? { selectedRepositoryBinding: resolved.repository } : {})
  })
  const finalizeAdditionalBindings = (): boolean => {
    const selected = attempt.selectedRepositoryBinding
    if (
      !includeSelectedRepository ||
      !selected ||
      !isExactRepositoryBindingV1(selected, attempt.secondFacts.mapping)
    ) {
      return !includeSelectedRepository
    }
    const current = dependencies.worktreeBindings
    if (!('isExactLocalNativeGitBindingCatalogCurrent' in current)) {
      return false
    }
    return (
      current.isExactLocalNativeGitBindingCatalogCurrent(attempt.binding) &&
      (selected === attempt.binding || current.isExactLocalNativeGitBindingCatalogCurrent(selected))
    )
  }
  return Object.freeze({
    finalize: () => {
      const rootRun = finalizeTicketWorkspaceRootRunJoinV1(attempt, {
        ...dependencies,
        selection,
        checkOriginalOperation,
        finalizeAdditionalBindings
      })
      if (!rootRun || !checkOriginalOperation()) {
        return null
      }
      return Object.freeze({
        rootRun,
        ...(attempt.selectedRepositoryBinding
          ? { selectedRepositoryWorktreeId: attempt.selectedRepositoryBinding.target.worktree.id }
          : {})
      })
    }
  })
}

async function resolveBindings(
  bindings: BindingCommands | CommonJoinDependenciesV1['worktreeBindings'],
  coordinatorRequest: TicketWorkspaceRootRunJoinAttemptV1['firstFacts']['request'],
  repositoryRequest:
    | TicketWorkspaceRootRunJoinAttemptV1['firstFacts']['mapping']['request']
    | undefined,
  signal: AbortSignal
): Promise<Readonly<{
  coordinator: ExactLocalNativeGitWorktreeBinding
  repository?: ExactLocalNativeGitWorktreeBinding
}> | null> {
  const same =
    repositoryRequest !== undefined && isDeepStrictEqual(coordinatorRequest, repositoryRequest)
  const requests =
    same || repositoryRequest === undefined
      ? [coordinatorRequest]
      : [coordinatorRequest, repositoryRequest]
  const results = await Promise.all(
    requests.map(async (request) => {
      try {
        return await bindings.resolveExactLocalNativeGitTarget(request, signal)
      } catch {
        return null
      }
    })
  )
  const coordinator = results[0]
  const repository = same ? coordinator : results[1]
  return coordinator && (repositoryRequest === undefined || repository)
    ? Object.freeze({ coordinator, ...(repository ? { repository } : {}) })
    : null
}

async function bindingsCurrent(
  bindings: BindingCommands | CommonJoinDependenciesV1['worktreeBindings'],
  resolved: Readonly<{
    coordinator: ExactLocalNativeGitWorktreeBinding
    repository?: ExactLocalNativeGitWorktreeBinding
  }>,
  signal: AbortSignal
): Promise<boolean> {
  const values =
    resolved.repository && resolved.repository !== resolved.coordinator
      ? [resolved.coordinator, resolved.repository]
      : [resolved.coordinator]
  const results = await Promise.all(
    values.map(async (binding) => {
      try {
        return await bindings.isExactLocalNativeGitBindingCurrent(binding, signal)
      } catch {
        return false
      }
    })
  )
  return results.every(Boolean)
}
