import { isDeepStrictEqual } from 'node:util'
import type { NativeGitOperationMarkerCapture } from '../git/native-git-operation-marker-capture'
import type { NativeGitWorktreeStatusRecordCapture } from '../git/native-worktree-status-record-capture'
import type { ExactLocalNativeGitStatusRecordCapture } from './runtime-git-status-record-capture'
import type {
  TicketWorkspaceLiveOwnerCompositionDependencies,
  TicketWorkspaceLiveOwnerEvidenceResult,
  TicketWorkspaceLiveOwnerUnavailable
} from './ticket-workspace-live-owner-composition'
import {
  sameOwnerReadFacts,
  sameSelectedOwnerFacts
} from './ticket-workspace-live-owner-composition-policy'
import {
  bindTicketWorkspaceOwnerAcrossReads,
  revalidateTicketWorkspaceOwnerBinding
} from './ticket-workspace-live-owner-composition-join'
import type { TicketWorkspaceOwnerOperationContext } from './ticket-workspace-live-owner-composition-operation'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'

export async function captureTicketWorkspaceLiveOwnerEvidence(
  dependencies: TicketWorkspaceLiveOwnerCompositionDependencies,
  selection: TicketWorkspaceOwnerSelection,
  context: TicketWorkspaceOwnerOperationContext
): Promise<Exclude<
  TicketWorkspaceLiveOwnerEvidenceResult,
  TicketWorkspaceLiveOwnerUnavailable
> | null> {
  const attempt = await bindTicketWorkspaceOwnerAcrossReads(
    dependencies.sourcePort,
    dependencies.worktreeBindings,
    selection,
    context
  )
  if (!attempt || !context.check()) {
    return null
  }

  let capture: ExactLocalNativeGitStatusRecordCapture
  try {
    capture = await dependencies.statusCapture.captureExactLocalNativeGitStatusRecords(
      attempt.binding,
      context.signal
    )
  } catch {
    context.check()
    return null
  }
  if (!context.check()) {
    return null
  }

  const lastRead = await context.readCurrent()
  if (
    !lastRead ||
    !context.reads.every((read) => sameOwnerReadFacts(attempt.firstRead, read, selection)) ||
    !sameSelectedOwnerFacts(attempt.baseline, lastRead.snapshot, selection)
  ) {
    return null
  }

  if (
    !(await revalidateTicketWorkspaceOwnerBinding(
      dependencies.sourcePort,
      dependencies.worktreeBindings,
      attempt,
      selection,
      context
    )) ||
    !isCompleteCapture(capture, attempt.binding)
  ) {
    return null
  }

  return Object.freeze({
    status: 'captured' as const,
    snapshotRevision: attempt.baseline.snapshotRevision,
    ticketKey: selection.ticketKey,
    repositoryId: selection.repositoryId,
    source: lastRead.snapshot.source,
    workspaceRef: attempt.mapping.workspaceRef,
    observationId: capture.observationId,
    ownerReadStartedAt: capture.ownerReadStartedAt,
    statusCapture: capture.status,
    operationMarkers: capture.operationMarkers
  })
}

function isCompleteCapture(
  capture: ExactLocalNativeGitStatusRecordCapture,
  binding: ExactLocalNativeGitStatusRecordCapture['binding']
): boolean {
  return (
    isDeepStrictEqual(capture.binding, binding) &&
    isNonEmptyString(capture.observationId) &&
    Number.isFinite(capture.ownerReadStartedAt) &&
    isCompleteStatusCapture(capture.status) &&
    isCompleteOperationMarkers(capture.operationMarkers)
  )
}

function isCompleteStatusCapture(status: NativeGitWorktreeStatusRecordCapture): boolean {
  return (
    status.executionRoute === 'native' &&
    status.complete &&
    Number.isSafeInteger(status.rawRecordCount) &&
    status.rawRecordCount >= 0 &&
    Number.isSafeInteger(status.representedRecordCount) &&
    status.representedRecordCount >= 0 &&
    status.unsupportedRecordCount === 0 &&
    status.representedRecordCount === status.rawRecordCount &&
    status.records.length === status.representedRecordCount
  )
}

function isCompleteOperationMarkers(markers: NativeGitOperationMarkerCapture): boolean {
  return (
    markers.filesystemRoute === 'native' &&
    markers.complete &&
    Object.values(markers.markers).every((state) => state !== 'unavailable')
  )
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0
}
