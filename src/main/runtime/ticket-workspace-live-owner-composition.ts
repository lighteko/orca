import { performance } from 'node:perf_hooks'
import type {
  TicketNavigatorSnapshotV1,
  WorkspaceRefV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type { NativeGitOperationMarkerCapture } from '../git/native-git-operation-marker-capture'
import type { NativeGitWorktreeStatusRecordCapture } from '../git/native-worktree-status-record-capture'
import type { TicketWorkspaceOwnerSourcePort } from '../ticket-workspace/ticket-workspace-resident-source-port'
import type { RuntimeWorktreeCatalogBindingCommands } from './runtime-worktree-catalog-binding'
import type { RuntimeGitStatusRecordCaptureCommands } from './runtime-git-status-record-capture'
import { captureTicketWorkspaceLiveOwnerEvidence } from './ticket-workspace-live-owner-composition-evidence'
import {
  bindTicketWorkspaceOwnerAcrossReads,
  revalidateTicketWorkspaceOwnerBinding,
  sameOwnerRequest
} from './ticket-workspace-live-owner-composition-join'
import {
  runTicketWorkspaceOwnerOperation,
  type TicketWorkspaceOwnerClock
} from './ticket-workspace-live-owner-composition-operation'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'

type ExactTargetResolver = Pick<
  RuntimeWorktreeCatalogBindingCommands,
  'isExactLocalNativeGitBindingCurrent' | 'resolveExactLocalNativeGitTarget'
>
type StatusCapture = Pick<
  RuntimeGitStatusRecordCaptureCommands,
  'captureExactLocalNativeGitStatusRecords'
>

export type TicketWorkspaceLiveOwnerCompositionDependencies = Readonly<{
  sourcePort: TicketWorkspaceOwnerSourcePort
  worktreeBindings: ExactTargetResolver
  statusCapture: StatusCapture
  clock?: TicketWorkspaceOwnerClock
}>

export type TicketWorkspaceLiveOwnerUnavailable = Readonly<{
  status: 'unavailable'
  snapshotRevision: string
  ticketKey: string
  repositoryId: string
}>

export type TicketWorkspaceLiveOwnerMatchResult =
  | TicketWorkspaceLiveOwnerUnavailable
  | Readonly<{
      status: 'matched'
      snapshotRevision: string
      ticketKey: string
      repositoryId: string
    }>

export type TicketWorkspaceLiveOwnerRebindResult =
  | TicketWorkspaceLiveOwnerUnavailable
  | Readonly<{
      status: 'rebound'
      snapshotRevision: string
      ticketKey: string
      repositoryId: string
      worktreeId: string
    }>

export type TicketWorkspaceLiveOwnerEvidenceResult =
  | TicketWorkspaceLiveOwnerUnavailable
  | Readonly<{
      status: 'captured'
      snapshotRevision: string
      ticketKey: string
      repositoryId: string
      source: TicketNavigatorSnapshotV1['source']
      workspaceRef: WorkspaceRefV1
      observationId: string
      ownerReadStartedAt: number
      statusCapture: NativeGitWorktreeStatusRecordCapture
      operationMarkers: NativeGitOperationMarkerCapture
    }>

const defaultClock: TicketWorkspaceOwnerClock = { monotonicNow: () => performance.now() }

export class RuntimeTicketWorkspaceLiveOwnerCompositionCommands {
  private readonly clock: TicketWorkspaceOwnerClock

  constructor(private readonly dependencies: TicketWorkspaceLiveOwnerCompositionDependencies) {
    this.clock = dependencies.clock ?? defaultClock
  }

  async matchSelection(
    selection: TicketWorkspaceOwnerSelection,
    signal?: AbortSignal
  ): Promise<TicketWorkspaceLiveOwnerMatchResult> {
    return (
      (await runTicketWorkspaceOwnerOperation(
        this.dependencies.sourcePort,
        this.clock,
        selection,
        signal,
        async (context) => {
          const attempt = await bindTicketWorkspaceOwnerAcrossReads(
            this.dependencies.sourcePort,
            this.dependencies.worktreeBindings,
            selection,
            context
          )
          if (
            !attempt ||
            !context.check() ||
            !(await revalidateTicketWorkspaceOwnerBinding(
              this.dependencies.sourcePort,
              this.dependencies.worktreeBindings,
              attempt,
              selection,
              context
            ))
          ) {
            return null
          }
          return Object.freeze({
            status: 'matched' as const,
            snapshotRevision: attempt.baseline.snapshotRevision,
            ticketKey: selection.ticketKey,
            repositoryId: selection.repositoryId
          })
        }
      )) ?? unavailableResult(selection)
    )
  }

  async rebindSelectionAtClick(
    selection: TicketWorkspaceOwnerSelection,
    signal?: AbortSignal
  ): Promise<TicketWorkspaceLiveOwnerRebindResult> {
    return (
      (await runTicketWorkspaceOwnerOperation(
        this.dependencies.sourcePort,
        this.clock,
        selection,
        signal,
        async (context) => {
          const attempt = await bindTicketWorkspaceOwnerAcrossReads(
            this.dependencies.sourcePort,
            this.dependencies.worktreeBindings,
            selection,
            context
          )
          if (
            !attempt ||
            !context.check() ||
            !sameOwnerRequest(attempt) ||
            !(await revalidateTicketWorkspaceOwnerBinding(
              this.dependencies.sourcePort,
              this.dependencies.worktreeBindings,
              attempt,
              selection,
              context
            ))
          ) {
            return null
          }
          return Object.freeze({
            status: 'rebound' as const,
            snapshotRevision: attempt.baseline.snapshotRevision,
            ticketKey: selection.ticketKey,
            repositoryId: selection.repositoryId,
            worktreeId: attempt.binding.target.worktree.id
          })
        }
      )) ?? unavailableResult(selection)
    )
  }

  async captureStatusEvidence(
    selection: TicketWorkspaceOwnerSelection,
    signal?: AbortSignal
  ): Promise<TicketWorkspaceLiveOwnerEvidenceResult> {
    return (
      (await runTicketWorkspaceOwnerOperation(
        this.dependencies.sourcePort,
        this.clock,
        selection,
        signal,
        (context) => captureTicketWorkspaceLiveOwnerEvidence(this.dependencies, selection, context)
      )) ?? unavailableResult(selection)
    )
  }
}

function unavailableResult(
  selection: TicketWorkspaceOwnerSelection
): TicketWorkspaceLiveOwnerUnavailable {
  return Object.freeze({
    status: 'unavailable',
    snapshotRevision: selection.snapshotRevision,
    ticketKey: selection.ticketKey,
    repositoryId: selection.repositoryId
  })
}
