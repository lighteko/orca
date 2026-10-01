import { useCallback, useRef, type JSX } from 'react'
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type VirtualItem
} from '@tanstack/react-virtual'
import { translate } from '@/i18n/i18n'
import type { TicketWorkspaceFixtureTicket } from '../../../../shared/ticket-workspace-fixture-boundary'
import { cn } from '@/lib/utils'

const TICKET_ROW_HEIGHT = 44
const WORKSPACE_ROW_HEIGHT = 52
const VIRTUAL_OVERSCAN = 5

export function VirtualizedTicketList({
  tickets,
  selectedIndex,
  onSelect
}: {
  tickets: TicketWorkspaceFixtureTicket[]
  selectedIndex: number
  onSelect: (index: number) => void
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rangeExtractor = usePinnedActiveRange(selectedIndex)
  const virtualizer = useVirtualizer({
    count: tickets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TICKET_ROW_HEIGHT,
    getItemKey: (index) => tickets[index]?.ticketKey ?? index,
    initialRect: { width: 0, height: 192 },
    overscan: VIRTUAL_OVERSCAN,
    rangeExtractor
  })
  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div
      ref={scrollRef}
      aria-activedescendant={optionId('ticket', selectedIndex)}
      aria-label={translate('ticketWorkspace.sidebar.ticketList', 'Tickets')}
      className="min-h-0 flex-1 overflow-y-auto rounded-md px-2 outline-none scrollbar-sleek focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-worktree-sidebar-foreground/70"
      onKeyDown={(event) => {
        const nextIndex = getNextActiveIndex(event.key, selectedIndex, tickets.length)
        if (nextIndex === null) {
          return
        }
        event.preventDefault()
        onSelect(nextIndex)
        virtualizer.scrollToIndex(nextIndex, { align: 'auto' })
      }}
      role="listbox"
      tabIndex={0}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((row) => {
          const ticket = tickets[row.index]
          if (!ticket) {
            return null
          }
          return (
            <TicketOption
              key={row.key}
              row={row}
              totalCount={tickets.length}
              ticket={ticket}
              selected={selectedIndex === row.index}
              onSelect={() => {
                onSelect(row.index)
                scrollRef.current?.focus({ preventScroll: true })
                virtualizer.scrollToIndex(row.index, { align: 'auto' })
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function TicketOption({
  row,
  totalCount,
  ticket,
  selected,
  onSelect
}: {
  row: VirtualItem
  totalCount: number
  ticket: TicketWorkspaceFixtureTicket
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <div
      id={optionId('ticket', row.index)}
      aria-label={translate(
        'ticketWorkspace.sidebar.selectTicket',
        'Select {{ticketKey}}: {{label}}',
        { ticketKey: ticket.ticketKey, label: ticket.label }
      )}
      aria-posinset={row.index + 1}
      aria-selected={selected}
      aria-setsize={totalCount}
      className={cn(
        'absolute left-0 top-0 flex h-11 w-full min-w-0 cursor-pointer flex-col justify-center rounded-md px-2 text-left text-worktree-sidebar-foreground hover:bg-worktree-sidebar-accent hover:text-worktree-sidebar-accent-foreground',
        selected &&
          'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground ring-1 ring-inset ring-worktree-sidebar-foreground/70'
      )}
      data-index={row.index}
      onClick={onSelect}
      role="option"
      style={{ transform: `translateY(${row.start}px)` }}
    >
      <span className="w-full truncate text-xs font-medium">{ticket.label}</span>
      <span
        className={cn(
          'w-full truncate text-xs text-worktree-sidebar-foreground',
          selected && 'text-worktree-sidebar-accent-foreground'
        )}
      >
        {ticket.ticketKey}
      </span>
    </div>
  )
}

export function VirtualizedWorkspaceList({
  workspaces,
  selectedIndex,
  onSelect,
  onActivate
}: {
  workspaces: TicketWorkspaceFixtureTicket['workspaces']
  selectedIndex: number
  onSelect: (index: number) => void
  onActivate: (index: number) => void
}): JSX.Element {
  const activeIndex = workspaces.length === 0 ? -1 : Math.min(selectedIndex, workspaces.length - 1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rangeExtractor = usePinnedActiveRange(activeIndex)
  const virtualizer = useVirtualizer({
    count: workspaces.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => WORKSPACE_ROW_HEIGHT,
    getItemKey: (index) => workspaces[index]?.repositoryId ?? index,
    initialRect: { width: 0, height: 144 },
    overscan: VIRTUAL_OVERSCAN,
    rangeExtractor
  })
  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div
      ref={scrollRef}
      aria-activedescendant={optionId('workspace', activeIndex)}
      aria-label={translate('ticketWorkspace.sidebar.workspaceRecords', 'Workspace records')}
      className="mt-1 max-h-36 min-h-0 overflow-y-auto rounded-md outline-none scrollbar-sleek focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-worktree-sidebar-foreground/70"
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && activeIndex >= 0) {
          event.preventDefault()
          onActivate(activeIndex)
          return
        }
        const nextIndex = getNextActiveIndex(event.key, activeIndex, workspaces.length)
        if (nextIndex === null) {
          return
        }
        event.preventDefault()
        onSelect(nextIndex)
        virtualizer.scrollToIndex(nextIndex, { align: 'auto' })
      }}
      role="listbox"
      tabIndex={0}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((row) => {
          const workspace = workspaces[row.index]
          if (!workspace) {
            return null
          }
          return (
            <WorkspaceOption
              key={row.key}
              row={row}
              totalCount={workspaces.length}
              workspace={workspace}
              selected={activeIndex === row.index}
              onSelect={() => {
                onSelect(row.index)
                scrollRef.current?.focus({ preventScroll: true })
                virtualizer.scrollToIndex(row.index, { align: 'auto' })
              }}
              onActivate={() => onActivate(row.index)}
            />
          )
        })}
      </div>
    </div>
  )
}

function WorkspaceOption({
  row,
  totalCount,
  workspace,
  selected,
  onSelect,
  onActivate
}: {
  row: VirtualItem
  totalCount: number
  workspace: TicketWorkspaceFixtureTicket['workspaces'][number]
  selected: boolean
  onSelect: () => void
  onActivate: () => void
}): JSX.Element {
  return (
    <div
      id={optionId('workspace', row.index)}
      aria-label={`${workspace.label}, ${workspace.repositoryId}, ${workspace.role}, ${translate(
        'ticketWorkspace.sidebar.fixtureState',
        'Fixture state: {{state}}',
        { state: workspace.actualState }
      )}`}
      aria-posinset={row.index + 1}
      aria-selected={selected}
      aria-setsize={totalCount}
      className={cn(
        'absolute left-0 top-0 flex h-[52px] w-full cursor-pointer flex-col justify-center rounded-md border-l border-worktree-sidebar-border pl-2 text-left text-worktree-sidebar-foreground hover:bg-worktree-sidebar-accent hover:text-worktree-sidebar-accent-foreground',
        selected &&
          'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground ring-1 ring-inset ring-worktree-sidebar-foreground/70'
      )}
      data-index={row.index}
      onClick={() => {
        onSelect()
        onActivate()
      }}
      role="option"
      style={{ transform: `translateY(${row.start}px)` }}
    >
      <span className="truncate text-xs">{workspace.label}</span>
      <span
        className={cn(
          'truncate text-[11px] text-worktree-sidebar-foreground',
          selected && 'text-worktree-sidebar-accent-foreground'
        )}
      >
        {workspace.repositoryId} · {workspace.role} ·{' '}
        {translate('ticketWorkspace.sidebar.fixtureState', 'Fixture state: {{state}}', {
          state: workspace.actualState
        })}
      </span>
    </div>
  )
}

function usePinnedActiveRange(activeIndex: number) {
  return useCallback(
    (range: Range) => {
      const indexes = new Set(defaultRangeExtractor(range))
      if (activeIndex >= 0 && activeIndex < range.count) {
        indexes.add(activeIndex)
      }
      return [...indexes].sort((left, right) => left - right)
    },
    [activeIndex]
  )
}

function getNextActiveIndex(key: string, activeIndex: number, count: number): number | null {
  if (count === 0) {
    return null
  }
  if (key === 'ArrowDown') {
    return Math.min(activeIndex + 1, count - 1)
  }
  if (key === 'ArrowUp') {
    return Math.max(activeIndex - 1, 0)
  }
  if (key === 'Home') {
    return 0
  }
  if (key === 'End') {
    return count - 1
  }
  return null
}

function optionId(kind: 'ticket' | 'workspace', index: number): string {
  return `ticket-workspace-${kind}-option-${index}`
}
