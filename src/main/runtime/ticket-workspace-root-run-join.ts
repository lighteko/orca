import { performance } from 'node:perf_hooks'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type { TicketWorkspaceOwnerSourcePort } from '../ticket-workspace/ticket-workspace-resident-source-port'
import type { TicketWorkspaceRootRunAttestationResultV1 } from './ticket-workspace-root-run-attestation'
import type {
  ExactLocalNativeGitWorktreeBinding,
  RuntimeWorktreeCatalogBindingCommands
} from './runtime-worktree-catalog-binding'
import {
  runTicketWorkspaceOwnerOperation,
  type TicketWorkspaceOwnerClock
} from './ticket-workspace-live-owner-composition-operation'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'
import {
  isExactCoordinatorBindingV1,
  finalizeTicketWorkspaceRootRunJoinV1,
  readTicketWorkspaceRootRunJoinFactsV1,
  readRootRunFactsV1,
  sameTicketRunCoordinatorFactsV1,
  sameTicketWorkspaceOwnerFactsV1,
  type TicketWorkspaceRootRunJoinCandidateV1,
  type TicketWorkspaceRootRunJoinAttemptV1,
  type TicketWorkspaceRootRunHostScopeMapV1
} from './ticket-workspace-root-run-join-facts'

const defaultClock: TicketWorkspaceOwnerClock = { monotonicNow: () => performance.now() }

type ExactTargetResolver = Pick<
  RuntimeWorktreeCatalogBindingCommands,
  'isExactLocalNativeGitBindingCurrent' | 'resolveExactLocalNativeGitTarget'
>

export type TicketWorkspaceRootRunJoinDependenciesV1 = Readonly<{
  sourcePort: TicketWorkspaceOwnerSourcePort
  worktreeBindings: ExactTargetResolver
  readRootRunFacts(): TicketWorkspaceRootRunAttestationResultV1
  mapOrchestrationHostScope: TicketWorkspaceRootRunHostScopeMapV1
  clock?: TicketWorkspaceOwnerClock
}>

export type { TicketWorkspaceRootRunJoinCandidateV1 } from './ticket-workspace-root-run-join-facts'

export type TicketWorkspaceRootRunJoinResultV1 =
  | TicketWorkspaceRootRunJoinCandidateV1
  | Readonly<{
      verdict: 'unavailable'
      reasonCode:
        | 'input_invalid'
        | 'root_run_unavailable'
        | 'host_mapping_unavailable'
        | 'catalog_unavailable'
        | 'correlation_mismatch'
        | 'workspace_unavailable'
        | 'owner_binding_unavailable'
        | 'operation_expired'
    }>

export async function createTicketWorkspaceRootRunJoinCandidateV1(
  dependencies: TicketWorkspaceRootRunJoinDependenciesV1,
  selection: TicketWorkspaceOwnerSelection,
  signal?: AbortSignal
): Promise<TicketWorkspaceRootRunJoinResultV1> {
  const clock = dependencies.clock ?? defaultClock
  let invocationStartedAt: number
  try {
    invocationStartedAt = clock.monotonicNow()
  } catch {
    return unavailable('operation_expired')
  }
  if (!Number.isFinite(invocationStartedAt)) {
    return unavailable('operation_expired')
  }

  const attempt = await runTicketWorkspaceOwnerOperation(
    dependencies.sourcePort,
    clock,
    selection,
    signal,
    async (context): Promise<TicketWorkspaceRootRunJoinAttemptV1 | null> => {
      const rootFacts = readRootRunFactsV1(dependencies.readRootRunFacts)
      if (!rootFacts || !context.check()) {
        return null
      }
      const baseline = readDisplayedBaseline(dependencies.sourcePort, selection)
      if (!baseline) {
        return null
      }
      const baselineFacts = readTicketWorkspaceRootRunJoinFactsV1(
        baseline,
        selection,
        rootFacts,
        dependencies.mapOrchestrationHostScope
      )
      if (!baselineFacts) {
        return null
      }

      const firstRead = await context.readCurrent()
      if (!firstRead || !context.check()) {
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

      let binding: ExactLocalNativeGitWorktreeBinding
      try {
        binding = await dependencies.worktreeBindings.resolveExactLocalNativeGitTarget(
          firstFacts.request,
          context.signal
        )
      } catch {
        context.check()
        return null
      }
      if (!context.check() || !isExactCoordinatorBindingV1(binding, firstFacts)) {
        return null
      }

      if (!(await isOriginalBindingCurrent(dependencies, binding, context.signal))) {
        context.check()
        return null
      }
      if (!context.check()) {
        return null
      }

      const secondRead = await context.readCurrent()
      if (!secondRead || !context.check()) {
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
        )
      ) {
        return null
      }

      if (!(await isOriginalBindingCurrent(dependencies, binding, context.signal))) {
        context.check()
        return null
      }
      if (!context.check()) {
        return null
      }
      const terminalBaseline = readDisplayedBaseline(dependencies.sourcePort, selection)
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
        !sameTicketRunCoordinatorFactsV1(baselineFacts.ticket, secondFacts.ticket)
      ) {
        return null
      }

      return Object.freeze({
        rootFacts,
        baseline,
        firstRead,
        secondRead,
        firstFacts,
        secondFacts,
        binding
      })
    }
  )

  if (!attempt) {
    return unavailable(signal?.aborted ? 'operation_expired' : 'catalog_unavailable')
  }
  const candidate = finalizeTicketWorkspaceRootRunJoinV1(attempt, {
    ...dependencies,
    selection,
    clock,
    signal,
    startedAt: invocationStartedAt
  })
  return candidate ?? unavailable(signal?.aborted ? 'operation_expired' : 'catalog_unavailable')
}

function readDisplayedBaseline(
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

async function isOriginalBindingCurrent(
  dependencies: TicketWorkspaceRootRunJoinDependenciesV1,
  binding: ExactLocalNativeGitWorktreeBinding,
  signal: AbortSignal
): Promise<boolean> {
  try {
    return await dependencies.worktreeBindings.isExactLocalNativeGitBindingCurrent(binding, signal)
  } catch {
    return false
  }
}

function unavailable(
  reasonCode: Extract<TicketWorkspaceRootRunJoinResultV1, { verdict: 'unavailable' }>['reasonCode']
): TicketWorkspaceRootRunJoinResultV1 {
  return Object.freeze({ verdict: 'unavailable', reasonCode })
}
