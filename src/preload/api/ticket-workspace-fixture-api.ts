import type { TicketWorkspaceFixturePresentation } from '../../shared/ticket-workspace-fixture-boundary'
import type {
  TicketWorkspaceFixtureMatchResponse,
  TicketWorkspaceFixtureRebindResponse,
  TicketWorkspaceFixtureSelection
} from '../../shared/ticket-workspace-owner-binding-boundary'

export type TicketWorkspaceFixtureApi = {
  getSnapshot: () => Promise<TicketWorkspaceFixturePresentation>
  matchFixtureSelection: (
    selection: TicketWorkspaceFixtureSelection
  ) => Promise<TicketWorkspaceFixtureMatchResponse>
  rebindFixtureSelection: (
    selection: TicketWorkspaceFixtureSelection
  ) => Promise<TicketWorkspaceFixtureRebindResponse>
}
