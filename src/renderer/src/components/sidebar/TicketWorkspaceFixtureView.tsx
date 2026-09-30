import { useCallback, useEffect, useState, type JSX, type ReactNode } from 'react'
import { translate } from '@/i18n/i18n'
import type {
  TicketWorkspaceFixturePresentation,
  TicketWorkspaceFixtureTicket
} from '../../../../shared/ticket-workspace-fixture-boundary'
import { VirtualizedTicketList } from './TicketWorkspaceVirtualLists'
import { TicketWorkspaceFixturePreview } from './TicketWorkspaceFixturePreview'
import {
  createTicketWorkspaceFixtureSelection,
  useTicketWorkspaceFixtureOwnerBinding
} from './useTicketWorkspaceFixtureOwnerBinding'

type FixturePresentation = Extract<TicketWorkspaceFixturePresentation, { status: 'fixture' }>
const EMPTY_TICKETS: TicketWorkspaceFixtureTicket[] = []

type ViewState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'fixture'; presentation: FixturePresentation }

export default function TicketWorkspaceFixtureView({
  onUnavailable
}: {
  onUnavailable?: () => void
}): JSX.Element {
  const [state, setState] = useState<ViewState>({ kind: 'loading' })
  const [selectedTicketKey, setSelectedTicketKey] = useState<string | null>(null)
  const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = useState(0)

  const showUnavailable = useCallback(() => {
    setState({ kind: 'unavailable' })
    onUnavailable?.()
  }, [onUnavailable])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const presentation = await window.api.ticketWorkspace.getSnapshot()
        if (active && presentation.status === 'fixture') {
          setState({ kind: 'fixture', presentation })
        } else if (active) {
          showUnavailable()
        }
      } catch {
        if (active) {
          showUnavailable()
        }
      }
    })()
    return () => {
      active = false
    }
  }, [showUnavailable])

  const tickets = state.kind === 'fixture' ? state.presentation.tickets : EMPTY_TICKETS
  const foundIndex = tickets.findIndex((ticket) => ticket.ticketKey === selectedTicketKey)
  const selectedTicketIndex = Math.max(0, foundIndex)
  const selectedTicket = tickets[selectedTicketIndex] ?? null
  const selectedWorkspace = selectedTicket?.workspaces[selectedWorkspaceIndex] ?? null
  const snapshotRevision =
    state.kind === 'fixture' ? state.presentation.provenance.snapshotRevision : ''
  const selectedSelection =
    selectedTicket && selectedWorkspace
      ? createTicketWorkspaceFixtureSelection(
          snapshotRevision,
          selectedTicket.ticketKey,
          selectedWorkspace.repositoryId
        )
      : null
  const { matchState, beginSelectionChange, activateSelection } =
    useTicketWorkspaceFixtureOwnerBinding(selectedSelection)

  const selectTicket = useCallback(
    (index: number) => {
      const ticket = tickets[index]
      if (!ticket) {
        return
      }
      const firstWorkspace = ticket.workspaces[0]
      beginSelectionChange(
        firstWorkspace
          ? createTicketWorkspaceFixtureSelection(
              snapshotRevision,
              ticket.ticketKey,
              firstWorkspace.repositoryId
            )
          : null
      )
      setSelectedTicketKey(ticket.ticketKey)
      setSelectedWorkspaceIndex(0)
    },
    [beginSelectionChange, snapshotRevision, tickets]
  )

  const selectWorkspace = useCallback(
    (index: number) => {
      if (!selectedTicket) {
        return
      }
      const workspace = selectedTicket.workspaces[index]
      if (!workspace) {
        return
      }
      beginSelectionChange(
        createTicketWorkspaceFixtureSelection(
          snapshotRevision,
          selectedTicket.ticketKey,
          workspace.repositoryId
        )
      )
      setSelectedWorkspaceIndex(index)
    },
    [beginSelectionChange, selectedTicket, snapshotRevision]
  )

  const activateWorkspace = useCallback(
    (index: number) => {
      if (!selectedTicket) {
        return
      }
      const workspace = selectedTicket.workspaces[index]
      if (!workspace) {
        return
      }

      activateSelection(
        createTicketWorkspaceFixtureSelection(
          snapshotRevision,
          selectedTicket.ticketKey,
          workspace.repositoryId
        )
      )
    },
    [activateSelection, selectedTicket, snapshotRevision]
  )

  if (state.kind === 'loading') {
    return (
      <InlineMessage>
        {translate('ticketWorkspace.sidebar.loading', 'Loading ticket fixture…')}
      </InlineMessage>
    )
  }
  if (state.kind === 'unavailable') {
    return (
      <InlineMessage>
        {translate('ticketWorkspace.sidebar.unavailable', 'Ticket snapshot unavailable.')}
      </InlineMessage>
    )
  }

  return (
    <section
      aria-label={translate('ticketWorkspace.sidebar.fixtureRegion', 'Ticket fixture')}
      className="flex min-h-0 flex-1 flex-col"
      data-ticket-fixture-view=""
    >
      <div
        className="mx-2 mt-2 rounded-md border border-worktree-sidebar-border px-2.5 py-2 text-xs text-worktree-sidebar-foreground"
        data-snapshot-case-id={state.presentation.provenance.snapshotCaseId}
      >
        <p>
          {translate('ticketWorkspace.sidebar.fixtureCase', 'Historical fixture · {{caseId}}', {
            caseId: state.presentation.provenance.snapshotCaseId
          })}
        </p>
        <p>
          {translate(
            'ticketWorkspace.sidebar.historicalNotice',
            'It does not show current workspace status.'
          )}
        </p>
      </div>
      {tickets.length === 0 ? (
        <InlineMessage>
          {translate('ticketWorkspace.sidebar.empty', 'No tickets in this fixture snapshot.')}
        </InlineMessage>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col px-2 pt-2">
            <div className="px-2 pb-1 text-xs font-medium text-worktree-sidebar-foreground">
              {translate('ticketWorkspace.sidebar.ticketList', 'Tickets')}
            </div>
            <VirtualizedTicketList
              tickets={tickets}
              selectedIndex={selectedTicketIndex}
              onSelect={selectTicket}
            />
          </div>
          {selectedTicket ? (
            <TicketWorkspaceFixturePreview
              key={selectedTicket.ticketKey}
              ticket={selectedTicket}
              selectedWorkspaceIndex={selectedWorkspaceIndex}
              matchState={selectedWorkspace ? matchState : null}
              onSelectWorkspace={selectWorkspace}
              onActivateWorkspace={activateWorkspace}
            />
          ) : null}
        </div>
      )}
    </section>
  )
}

function InlineMessage({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-center text-xs text-worktree-sidebar-foreground">
      {children}
    </div>
  )
}
