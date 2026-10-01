import { isDeepStrictEqual } from 'node:util'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type {
  CurrentTicketOwnerRead,
  TicketWorkspaceOwnerSourcePort
} from '../ticket-workspace/ticket-workspace-resident-source-port'
import type {
  ExactLocalNativeGitWorktreeBinding,
  RuntimeWorktreeCatalogBindingCommands
} from './runtime-worktree-catalog-binding'
import {
  selectEligibleTicketWorkspaceOwnerMapping,
  sameOwnerReadFacts,
  sameSelectedOwnerFacts
} from './ticket-workspace-live-owner-composition-policy'
import type { TicketWorkspaceOwnerOperationContext } from './ticket-workspace-live-owner-composition-operation'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'

type ExactTargetResolver = Pick<
  RuntimeWorktreeCatalogBindingCommands,
  'isExactLocalNativeGitBindingCurrent' | 'resolveExactLocalNativeGitTarget'
>

export type TicketWorkspaceLiveOwnerJoinAttempt = Readonly<{
  baseline: TicketNavigatorSnapshotV1
  firstRead: CurrentTicketOwnerRead
  mapping: NonNullable<ReturnType<typeof selectEligibleTicketWorkspaceOwnerMapping>>
  binding: ExactLocalNativeGitWorktreeBinding
}>

export async function bindTicketWorkspaceOwnerAcrossReads(
  sourcePort: TicketWorkspaceOwnerSourcePort,
  worktreeBindings: ExactTargetResolver,
  selection: TicketWorkspaceOwnerSelection,
  context: TicketWorkspaceOwnerOperationContext
): Promise<TicketWorkspaceLiveOwnerJoinAttempt | null> {
  let baseline: TicketNavigatorSnapshotV1 | null
  try {
    baseline = sourcePort.getDisplayedBaseline(selection.snapshotRevision)
  } catch {
    return null
  }
  if (
    !baseline ||
    baseline.snapshotRevision !== selection.snapshotRevision ||
    !selectEligibleTicketWorkspaceOwnerMapping(baseline, selection) ||
    !context.check()
  ) {
    return null
  }

  const firstRead = await context.readCurrent()
  if (!firstRead || !sameSelectedOwnerFacts(baseline, firstRead.snapshot, selection)) {
    return null
  }
  const mapping = selectEligibleTicketWorkspaceOwnerMapping(firstRead.snapshot, selection)
  if (!mapping || !context.check()) {
    return null
  }

  let binding: ExactLocalNativeGitWorktreeBinding
  try {
    binding = await worktreeBindings.resolveExactLocalNativeGitTarget(
      mapping.request,
      context.signal
    )
  } catch {
    context.check()
    return null
  }
  if (!context.check()) {
    return null
  }

  const secondRead = await context.readCurrent()
  if (
    !secondRead ||
    !sameOwnerReadFacts(firstRead, secondRead, selection) ||
    !sameSelectedOwnerFacts(baseline, secondRead.snapshot, selection)
  ) {
    return null
  }
  return Object.freeze({ baseline, firstRead, mapping, binding })
}

export async function revalidateTicketWorkspaceOwnerBinding(
  sourcePort: TicketWorkspaceOwnerSourcePort,
  worktreeBindings: ExactTargetResolver,
  attempt: TicketWorkspaceLiveOwnerJoinAttempt,
  selection: TicketWorkspaceOwnerSelection,
  context: TicketWorkspaceOwnerOperationContext
): Promise<boolean> {
  let ownerCurrent = false
  try {
    ownerCurrent = await worktreeBindings.isExactLocalNativeGitBindingCurrent(
      attempt.binding,
      context.signal
    )
  } catch {
    context.check()
    return false
  }
  const sourceAndDeadlineCurrent = context.check()
  let displayedBaselineCurrent = false
  try {
    const displayed = sourcePort.getDisplayedBaseline(selection.snapshotRevision)
    displayedBaselineCurrent =
      displayed?.snapshotRevision === selection.snapshotRevision &&
      sameSelectedOwnerFacts(attempt.baseline, displayed, selection)
  } catch {
    displayedBaselineCurrent = false
  }
  return ownerCurrent && sourceAndDeadlineCurrent && displayedBaselineCurrent
}

export function sameOwnerRequest(attempt: TicketWorkspaceLiveOwnerJoinAttempt): boolean {
  return (
    attempt.binding.target.worktree.id === attempt.mapping.request.worktreeId &&
    isDeepStrictEqual(attempt.binding.request, attempt.mapping.request)
  )
}
