import type { JSX } from 'react'
import { translate } from '@/i18n/i18n'
import type { TicketWorkspaceFixtureTicket } from '../../../../shared/ticket-workspace-fixture-boundary'
import { VirtualizedWorkspaceList } from './TicketWorkspaceVirtualLists'

export function TicketWorkspaceFixturePreview({
  ticket,
  selectedWorkspaceIndex,
  matchState,
  onSelectWorkspace,
  onActivateWorkspace
}: {
  ticket: TicketWorkspaceFixtureTicket
  selectedWorkspaceIndex: number
  matchState: 'checking' | 'matched' | 'unavailable' | null
  onSelectWorkspace: (index: number) => void
  onActivateWorkspace: (index: number) => void
}): JSX.Element {
  return (
    <section
      aria-label={translate('ticketWorkspace.sidebar.preview', 'Ticket preview')}
      className="max-h-1/2 shrink-0 overflow-y-auto border-t border-worktree-sidebar-border px-3 py-2 scrollbar-sleek"
    >
      <h2 className="truncate text-sm font-semibold text-sidebar-foreground">{ticket.label}</h2>
      <p className="truncate text-xs text-worktree-sidebar-foreground">{ticket.ticketKey}</p>
      <dl className="mt-2 space-y-1 text-xs">
        <PreviewLine
          label={translate('ticketWorkspace.sidebar.fixtureLifecycle', 'Fixture lifecycle')}
          value={ticket.lifecycle}
        />
        <PreviewLine
          label={translate('ticketWorkspace.sidebar.fixtureAvailability', 'Fixture availability')}
          value={ticket.availability}
        />
        <div>
          <dt className="text-worktree-sidebar-foreground">
            {translate('ticketWorkspace.sidebar.coordinator', 'Coordinator')}
          </dt>
          <dd className="break-words text-sidebar-foreground">
            {ticket.coordinatorTargetDeclared
              ? translate(
                  'ticketWorkspace.sidebar.coordinatorDeclared',
                  'Target declared in fixture; no Run is verified.'
                )
              : translate(
                  'ticketWorkspace.sidebar.coordinatorMissing',
                  'No coordinator target declared in this fixture.'
                )}
          </dd>
        </div>
      </dl>
      {matchState ? <OwnerMatchStatus matchState={matchState} /> : null}
      <h3 className="mt-3 text-xs font-medium text-sidebar-foreground">
        {translate('ticketWorkspace.sidebar.workspaceRecords', 'Workspace records')}
      </h3>
      {ticket.workspaces.length === 0 ? (
        <p className="mt-1 text-xs text-worktree-sidebar-foreground">
          {translate(
            'ticketWorkspace.sidebar.noWorkspaceRecords',
            'No workspace records in this fixture.'
          )}
        </p>
      ) : (
        <VirtualizedWorkspaceList
          workspaces={ticket.workspaces}
          selectedIndex={Math.min(selectedWorkspaceIndex, ticket.workspaces.length - 1)}
          onSelect={onSelectWorkspace}
          onActivate={onActivateWorkspace}
        />
      )}
    </section>
  )
}

function OwnerMatchStatus({
  matchState
}: {
  matchState: 'checking' | 'matched' | 'unavailable'
}): JSX.Element {
  const message =
    matchState === 'checking'
      ? translate(
          'ticketWorkspace.sidebar.matchChecking',
          'Checking for an exact Orca workspace match…'
        )
      : matchState === 'matched'
        ? translate(
            'ticketWorkspace.sidebar.matchAvailable',
            'Orca confirmed an exact workspace match.'
          )
        : translate(
            'ticketWorkspace.sidebar.matchUnavailable',
            'No exact Orca workspace match is available.'
          )
  return (
    <p className="mt-2 text-xs text-worktree-sidebar-foreground" role="status">
      {message}
    </p>
  )
}

function PreviewLine({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-worktree-sidebar-foreground">{label}</dt>
      <dd className="break-words text-sidebar-foreground">{value}</dd>
    </div>
  )
}
