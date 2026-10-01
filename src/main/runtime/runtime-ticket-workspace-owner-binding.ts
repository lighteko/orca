import { isDeepStrictEqual } from 'node:util'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type {
  ExactLocalNativeGitWorktreeBinding,
  RuntimeWorktreeCatalogBindingCommands
} from './runtime-worktree-catalog-binding'
import {
  selectTicketWorkspaceOwnerMapping,
  type TicketWorkspaceOwnerMappingResult,
  type TicketWorkspaceOwnerSelection,
  type TicketWorkspaceOwnerSelector
} from './ticket-workspace-owner-selection'

export type TicketWorkspaceOwnerMatchResult = Readonly<{
  status: 'matched' | 'unavailable'
  snapshotRevision: string
  ticketKey: string
  repositoryId: string
}>

export type TicketWorkspaceValidatedFixtureAccessor = (
  snapshotRevision: string
) => Promise<TicketNavigatorSnapshotV1 | null>

type ExactTargetResolver = Pick<
  RuntimeWorktreeCatalogBindingCommands,
  'isExactLocalNativeGitBindingCurrent' | 'resolveExactLocalNativeGitTarget'
>

export class RuntimeTicketWorkspaceOwnerBindingCommands {
  constructor(
    private readonly worktreeBindings: ExactTargetResolver,
    private readonly loadValidatedFixture: TicketWorkspaceValidatedFixtureAccessor
  ) {}

  async resolveFixtureMatch(
    snapshot: TicketNavigatorSnapshotV1,
    selector: TicketWorkspaceOwnerSelector
  ): Promise<TicketWorkspaceOwnerMatchResult> {
    const mapping = selectTicketWorkspaceOwnerMapping(snapshot, selector)
    if (mapping.status !== 'mapped') {
      return unavailableMatch(mapping)
    }

    try {
      await this.worktreeBindings.resolveExactLocalNativeGitTarget(mapping.request)
      return Object.freeze({
        status: 'matched',
        snapshotRevision: mapping.snapshotRevision,
        ticketKey: mapping.ticketKey,
        repositoryId: mapping.repositoryId
      })
    } catch {
      return unavailableMatch(mapping)
    }
  }

  async rebindFixtureSelection(selection: unknown): Promise<string | null> {
    const parsedSelection = parseSelection(selection)
    if (!parsedSelection) {
      return null
    }

    let snapshot: TicketNavigatorSnapshotV1 | null
    try {
      snapshot = await this.loadValidatedFixture(parsedSelection.snapshotRevision)
    } catch {
      return null
    }
    if (!snapshot || snapshot.snapshotRevision !== parsedSelection.snapshotRevision) {
      return null
    }

    const mapping = selectTicketWorkspaceOwnerMapping(snapshot, parsedSelection)
    if (mapping.status !== 'mapped') {
      return null
    }

    let binding: ExactLocalNativeGitWorktreeBinding
    try {
      binding = await this.worktreeBindings.resolveExactLocalNativeGitTarget(mapping.request)
    } catch {
      return null
    }

    try {
      if (!(await this.worktreeBindings.isExactLocalNativeGitBindingCurrent(binding))) {
        return null
      }
    } catch {
      return null
    }

    let currentSnapshot: TicketNavigatorSnapshotV1 | null
    try {
      currentSnapshot = await this.loadValidatedFixture(parsedSelection.snapshotRevision)
    } catch {
      return null
    }
    if (!currentSnapshot || currentSnapshot.snapshotRevision !== parsedSelection.snapshotRevision) {
      return null
    }
    const currentMapping = selectTicketWorkspaceOwnerMapping(currentSnapshot, parsedSelection)
    if (currentMapping.status !== 'mapped' || !sameOwnerMapping(mapping, currentMapping)) {
      return null
    }

    return binding.target.worktree.id
  }
}

function unavailableMatch(
  mapping: TicketWorkspaceOwnerMappingResult
): TicketWorkspaceOwnerMatchResult {
  return Object.freeze({
    status: 'unavailable',
    snapshotRevision: mapping.snapshotRevision,
    ticketKey: mapping.ticketKey,
    repositoryId: mapping.repositoryId
  })
}

function sameOwnerMapping(
  initial: Extract<TicketWorkspaceOwnerMappingResult, { status: 'mapped' }>,
  current: Extract<TicketWorkspaceOwnerMappingResult, { status: 'mapped' }>
): boolean {
  return (
    initial.snapshotRevision === current.snapshotRevision &&
    initial.ticketKey === current.ticketKey &&
    initial.repositoryId === current.repositoryId &&
    isDeepStrictEqual(initial.source, current.source) &&
    isDeepStrictEqual(initial.workspaceRef, current.workspaceRef) &&
    isDeepStrictEqual(initial.request, current.request)
  )
}

function parseSelection(value: unknown): TicketWorkspaceOwnerSelection | null {
  try {
    if (!isRecord(value)) {
      return null
    }
    const ownKeys = Reflect.ownKeys(value)
    if (
      ownKeys.length !== 3 ||
      ownKeys.some((key) => typeof key !== 'string') ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return null
    }
    const keys = ownKeys.filter((key): key is string => typeof key === 'string')
    if (
      !keys.includes('snapshotRevision') ||
      !keys.includes('ticketKey') ||
      !keys.includes('repositoryId')
    ) {
      return null
    }

    const snapshotRevision = value.snapshotRevision
    const ticketKey = value.ticketKey
    const repositoryId = value.repositoryId
    if (
      !isNonEmptyString(snapshotRevision) ||
      !isNonEmptyString(ticketKey) ||
      !isNonEmptyString(repositoryId)
    ) {
      return null
    }
    return Object.freeze({ snapshotRevision, ticketKey, repositoryId })
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
