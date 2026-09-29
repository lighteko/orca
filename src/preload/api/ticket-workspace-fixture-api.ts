import type { TicketWorkspaceFixturePresentation } from '../../shared/ticket-workspace-fixture-boundary'

export type TicketWorkspaceFixtureApi = {
  getSnapshot: () => Promise<TicketWorkspaceFixturePresentation>
}
