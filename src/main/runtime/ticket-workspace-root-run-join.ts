import { performance } from 'node:perf_hooks'
import type { TicketWorkspaceOwnerSourcePort } from '../ticket-workspace/ticket-workspace-resident-source-port'
import type { TicketWorkspaceRootRunAttestationResultV1 } from './ticket-workspace-root-run-attestation'
import type { RuntimeWorktreeCatalogBindingCommands } from './runtime-worktree-catalog-binding'
import {
  runTicketWorkspaceOwnerOperation,
  type TicketWorkspaceOwnerClock,
  type TicketWorkspaceOwnerOperationContext
} from './ticket-workspace-live-owner-composition-operation'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'
import {
  prepareTicketWorkspaceRootRunJoinOperationV1,
  type CommonJoinDependenciesV1,
  type CommonJoinInputV1,
  type TicketWorkspaceRootRunCommonJoinCandidateV1,
  type TicketWorkspaceRootRunCommonJoinWitnessV1,
  type TicketWorkspaceRootRunJoinOperationWitnessV1
} from './ticket-workspace-root-run-join-operation'
import type {
  TicketWorkspaceRootRunHostScopeMapV1,
  TicketWorkspaceRootRunJoinCandidateV1
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

export type { TicketWorkspaceRootRunJoinCandidateV1 }
export type {
  CommonJoinDependenciesV1,
  CommonJoinInputV1,
  TicketWorkspaceRootRunCommonJoinCandidateV1,
  TicketWorkspaceRootRunCommonJoinWitnessV1
}

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

  const prepared = await runTicketWorkspaceOwnerOperation(
    dependencies.sourcePort,
    clock,
    selection,
    signal,
    async (context): Promise<TicketWorkspaceRootRunJoinOperationWitnessV1 | null> =>
      prepareTicketWorkspaceRootRunJoinOperationV1(
        dependencies,
        {
          selection,
          context,
          callerSignal: signal,
          checkOriginalOperation: () =>
            checkOriginalOperation(signal, context, clock, invocationStartedAt)
        },
        false
      )
  )
  if (!prepared) {
    return unavailable(signal?.aborted ? 'operation_expired' : 'catalog_unavailable')
  }
  const candidate = prepared.finalize()?.rootRun
  return candidate ?? unavailable(signal?.aborted ? 'operation_expired' : 'catalog_unavailable')
}

export async function prepareTicketWorkspaceRootRunCommonJoinV1(
  dependencies: CommonJoinDependenciesV1,
  input: CommonJoinInputV1
): Promise<TicketWorkspaceRootRunCommonJoinWitnessV1 | null> {
  const prepared = await prepareTicketWorkspaceRootRunJoinOperationV1(
    dependencies,
    {
      ...input,
      checkOriginalOperation: () => checkCommonOriginalOperation(input, dependencies.sourcePort)
    },
    true
  )
  if (!prepared) {
    return null
  }
  return Object.freeze({
    finalize: (): TicketWorkspaceRootRunCommonJoinCandidateV1 | null => {
      const candidate = prepared.finalize()
      const selectedRepositoryWorktreeId = candidate?.selectedRepositoryWorktreeId
      return candidate && selectedRepositoryWorktreeId !== undefined
        ? Object.freeze({ rootRun: candidate.rootRun, selectedRepositoryWorktreeId })
        : null
    }
  })
}

function checkCommonOriginalOperation(
  input: CommonJoinInputV1,
  sourcePort: CommonJoinDependenciesV1['sourcePort']
): boolean {
  if (!checkOriginalOperation(input.callerSignal, input.context)) {
    return false
  }
  let presentedReadIsCurrent: boolean
  try {
    presentedReadIsCurrent = sourcePort.isCurrent(input.presentedRead)
  } catch {
    return false
  }
  return presentedReadIsCurrent && signalsCurrent(input.callerSignal, input.context)
}

function checkOriginalOperation(
  callerSignal: AbortSignal | undefined,
  context: TicketWorkspaceOwnerOperationContext,
  legacyClock?: TicketWorkspaceOwnerClock,
  legacyStartedAt?: number
): boolean {
  if (!signalsCurrent(callerSignal, context)) {
    return false
  }
  const current = context.check()
  if (!current || !signalsCurrent(callerSignal, context)) {
    return false
  }
  const legacyCurrent =
    legacyStartedAt === undefined ||
    (legacyClock !== undefined && withinLegacyDeadline(legacyClock, legacyStartedAt))
  return legacyCurrent && signalsCurrent(callerSignal, context)
}

function signalsCurrent(
  callerSignal: AbortSignal | undefined,
  context: TicketWorkspaceOwnerOperationContext
): boolean {
  return !callerSignal?.aborted && !context.signal.aborted
}

function withinLegacyDeadline(clock: TicketWorkspaceOwnerClock, startedAt: number): boolean {
  try {
    const now = clock.monotonicNow()
    return Number.isFinite(now) && now >= startedAt && now < startedAt + 30_000
  } catch {
    return false
  }
}

function unavailable(
  reasonCode: Extract<TicketWorkspaceRootRunJoinResultV1, { verdict: 'unavailable' }>['reasonCode']
): TicketWorkspaceRootRunJoinResultV1 {
  return Object.freeze({ verdict: 'unavailable', reasonCode })
}
