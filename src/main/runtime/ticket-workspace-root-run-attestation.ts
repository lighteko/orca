import type { OrchestrationCompatibilityEvidence } from '../../shared/orchestration-compatibility-evidence'
import type { WorkerTerminalHostScope } from '../../shared/worker-terminal-host-scope'
import type { RunRow } from './orchestration/types'
import { isEquivalentPaneKey } from './orchestration/db/pane-key-match'
import type {
  OrchestrationCompatibilityCallerAuthority,
  OrchestrationCompatibilityTerminalAuthority
} from './runtime-terminal-contracts'
import type { OrcaRuntimeService } from './orca-runtime'

export type TicketWorkspaceRootRunAttestationRuntimeV1 = Pick<
  OrcaRuntimeService,
  'verifyOrchestrationCompatibilityCaller' | 'getOrchestrationDispatchAuthority' | 'getRuntimeId'
>

export type TicketWorkspaceCurrentRootRunV1 = Readonly<
  Pick<
    RunRow,
    'id' | 'legacy' | 'coordinator_handle' | 'coordinator_pane_key' | 'consumer_generation'
  >
>

export type TicketWorkspaceCurrentRootRunLookupV1 = (
  paneKey: string
) => TicketWorkspaceCurrentRootRunV1 | null

export type TicketWorkspaceRootRunRuntimeFactsV1 = Readonly<{
  runtimeId: string
  runId: string
  consumerGeneration: number
  paneKey: string
  terminalHandle: string
  processIncarnation: string
  worktreeId: string
  hostScope: WorkerTerminalHostScope
}>

export type TicketWorkspaceRootRunAttestationResultV1 =
  | { verdict: 'available'; facts: TicketWorkspaceRootRunRuntimeFactsV1 }
  | {
      verdict: 'unavailable'
      reasonCode:
        | 'caller_unverified'
        | 'dispatch_unavailable'
        | 'dispatch_mismatch'
        | 'run_lookup_failed'
        | 'run_unavailable'
        | 'run_not_current'
        | 'run_generation_invalid'
    }

export function readTicketWorkspaceRootRunRuntimeFactsV1(
  runtime: TicketWorkspaceRootRunAttestationRuntimeV1,
  evidence: OrchestrationCompatibilityEvidence | null | undefined,
  readCurrentRun: TicketWorkspaceCurrentRootRunLookupV1
): TicketWorkspaceRootRunAttestationResultV1 {
  let caller: OrchestrationCompatibilityCallerAuthority | null
  try {
    caller = runtime.verifyOrchestrationCompatibilityCaller(evidence)
  } catch {
    return unavailable('caller_unverified')
  }
  if (!caller) {
    return unavailable('caller_unverified')
  }

  let dispatch: OrchestrationCompatibilityTerminalAuthority | null
  let runtimeId: string
  try {
    dispatch = runtime.getOrchestrationDispatchAuthority(caller.terminalHandle)
    runtimeId = runtime.getRuntimeId()
  } catch {
    return unavailable('dispatch_unavailable')
  }
  if (!dispatch) {
    return unavailable('dispatch_unavailable')
  }
  if (
    runtimeId.length === 0 ||
    dispatch.runtimeId !== runtimeId ||
    dispatch.terminalHandle !== caller.terminalHandle ||
    dispatch.paneKey !== caller.paneKey ||
    dispatch.processIncarnation !== caller.processIncarnation ||
    !sameHostScope(dispatch.hostScope, caller.hostScope) ||
    dispatch.worktreeId.length === 0
  ) {
    return unavailable('dispatch_mismatch')
  }

  let run: TicketWorkspaceCurrentRootRunV1 | null
  try {
    run = readCurrentRun(caller.paneKey)
  } catch {
    return unavailable('run_lookup_failed')
  }
  if (!run) {
    return unavailable('run_unavailable')
  }
  if (
    run.id.length === 0 ||
    run.legacy !== 0 ||
    run.coordinator_handle !== caller.terminalHandle ||
    run.coordinator_pane_key === null ||
    !isEquivalentPaneKey(run.coordinator_pane_key, caller.paneKey)
  ) {
    return unavailable('run_not_current')
  }
  if (!Number.isSafeInteger(run.consumer_generation) || run.consumer_generation < 0) {
    return unavailable('run_generation_invalid')
  }

  return Object.freeze({
    verdict: 'available',
    facts: Object.freeze({
      runtimeId,
      runId: run.id,
      consumerGeneration: run.consumer_generation,
      paneKey: caller.paneKey,
      terminalHandle: caller.terminalHandle,
      processIncarnation: caller.processIncarnation,
      worktreeId: dispatch.worktreeId,
      hostScope: copyHostScope(dispatch.hostScope)
    })
  })
}

function sameHostScope(
  left: OrchestrationCompatibilityTerminalAuthority['hostScope'],
  right: OrchestrationCompatibilityCallerAuthority['hostScope']
): boolean {
  if (left.kind !== right.kind) {
    return false
  }
  if (left.kind === 'local' && right.kind === 'local') {
    return left.hostId === right.hostId
  }
  if (left.kind === 'wsl' && right.kind === 'wsl') {
    return left.hostId === right.hostId && left.distro === right.distro
  }
  return left.kind === 'ssh' && right.kind === 'ssh' && left.targetId === right.targetId
}

function copyHostScope(scope: WorkerTerminalHostScope): WorkerTerminalHostScope {
  if (scope.kind === 'local') {
    return Object.freeze({ kind: 'local', hostId: scope.hostId })
  }
  if (scope.kind === 'wsl') {
    return Object.freeze({ kind: 'wsl', hostId: scope.hostId, distro: scope.distro })
  }
  return Object.freeze({ kind: 'ssh', targetId: scope.targetId })
}

function unavailable(
  reasonCode: Extract<
    TicketWorkspaceRootRunAttestationResultV1,
    { verdict: 'unavailable' }
  >['reasonCode']
): TicketWorkspaceRootRunAttestationResultV1 {
  return Object.freeze({ verdict: 'unavailable', reasonCode })
}
