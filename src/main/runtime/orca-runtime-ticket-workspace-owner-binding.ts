import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  parseTicketWorkspaceFixtureSelection,
  reboundTicketWorkspaceFixtureResponse,
  unavailableTicketWorkspaceFixtureMatchResponse,
  unavailableTicketWorkspaceFixtureRebindResponse,
  type TicketWorkspaceFixtureMatchResponse,
  type TicketWorkspaceFixtureRebindResponse
} from '../../shared/ticket-workspace-owner-binding-boundary'
import type {
  WorktreeCatalogBindingRequest,
  WorktreeCatalogBindingSourceSnapshot
} from '../persistence/loading-store/worktree-catalog-binding-types'
import { listNativeGitWorktreesForCatalog } from '../git/worktree-catalog-listing'
import { readNativeGitWorktreeRegistrationIdentity } from '../git/worktree-catalog-registration-identity'
import {
  RuntimeTicketWorkspaceOwnerBindingCommands,
  type TicketWorkspaceValidatedFixtureAccessor
} from './runtime-ticket-workspace-owner-binding'
import {
  type ExactLocalNativeGitWorktreeBinding,
  RuntimeWorktreeCatalogBindingCommands
} from './runtime-worktree-catalog-binding'
import { OrcaRuntimeWithPreservedBranchCleanup } from './orca-runtime-preserved-branch-cleanup'

export abstract class OrcaRuntimeWithTicketWorkspaceOwnerBinding extends OrcaRuntimeWithPreservedBranchCleanup {
  protected readonly worktreeCatalogBindingCommands = new RuntimeWorktreeCatalogBindingCommands({
    getWorktreeCatalogBindingSourceSnapshot: (request) =>
      this.getTicketWorkspaceOwnerBindingSourceSnapshot(request),
    listNativeGitWorktrees: listNativeGitWorktreesForCatalog,
    readWorktreeRegistrationIdentity: readNativeGitWorktreeRegistrationIdentity
  })

  protected abstract getTicketWorkspaceOwnerBindingSourceSnapshot(
    request: WorktreeCatalogBindingRequest
  ): WorktreeCatalogBindingSourceSnapshot | null

  protected resolveExactLocalNativeGitWorktreeCatalogBinding(
    request: WorktreeCatalogBindingRequest,
    signal?: AbortSignal
  ): Promise<ExactLocalNativeGitWorktreeBinding> {
    return this.worktreeCatalogBindingCommands.resolveExactLocalNativeGitTarget(request, signal)
  }

  protected revalidateExactLocalNativeGitWorktreeCatalogBinding(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<boolean> {
    return this.worktreeCatalogBindingCommands.isExactLocalNativeGitBindingCurrent(binding, signal)
  }

  async matchTicketWorkspaceFixtureSelection(
    snapshot: TicketNavigatorSnapshotV1,
    selection: unknown
  ): Promise<TicketWorkspaceFixtureMatchResponse> {
    const parsedSelection = parseTicketWorkspaceFixtureSelection(selection)
    if (!parsedSelection || snapshot.snapshotRevision !== parsedSelection.snapshotRevision) {
      return unavailableTicketWorkspaceFixtureMatchResponse(parsedSelection ?? undefined)
    }
    const commands = this.createTicketWorkspaceOwnerBindingCommands(async (revision) =>
      revision === snapshot.snapshotRevision ? snapshot : null
    )
    try {
      return await commands.resolveFixtureMatch(snapshot, parsedSelection)
    } catch {
      return unavailableTicketWorkspaceFixtureMatchResponse(parsedSelection)
    }
  }

  async rebindTicketWorkspaceFixtureSelection(
    selection: unknown,
    loadValidatedFixture: TicketWorkspaceValidatedFixtureAccessor
  ): Promise<TicketWorkspaceFixtureRebindResponse> {
    const parsedSelection = parseTicketWorkspaceFixtureSelection(selection)
    if (!parsedSelection) {
      return unavailableTicketWorkspaceFixtureRebindResponse()
    }
    try {
      const commands = this.createTicketWorkspaceOwnerBindingCommands(loadValidatedFixture)
      const worktreeId = await commands.rebindFixtureSelection(parsedSelection)
      return reboundTicketWorkspaceFixtureResponse(parsedSelection, worktreeId)
    } catch {
      return unavailableTicketWorkspaceFixtureRebindResponse(parsedSelection)
    }
  }

  private createTicketWorkspaceOwnerBindingCommands(
    loadValidatedFixture: TicketWorkspaceValidatedFixtureAccessor
  ): RuntimeTicketWorkspaceOwnerBindingCommands {
    return new RuntimeTicketWorkspaceOwnerBindingCommands(
      {
        resolveExactLocalNativeGitTarget: (request) =>
          this.worktreeCatalogBindingCommands.resolveExactLocalNativeGitTarget(request),
        isExactLocalNativeGitBindingCurrent: (binding) =>
          this.worktreeCatalogBindingCommands.isExactLocalNativeGitBindingCurrent(binding)
      },
      loadValidatedFixture
    )
  }
}
