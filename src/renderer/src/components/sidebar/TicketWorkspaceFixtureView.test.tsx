// @vitest-environment happy-dom

import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TicketWorkspaceFixtureView from './TicketWorkspaceFixtureView'
import type {
  TicketWorkspaceFixturePresentation,
  TicketWorkspaceFixtureTicket
} from '../../../../shared/ticket-workspace-fixture-boundary'
import type {
  TicketWorkspaceFixtureMatchResponse,
  TicketWorkspaceFixtureRebindResponse,
  TicketWorkspaceFixtureSelection
} from '../../../../shared/ticket-workspace-owner-binding-boundary'

const getSnapshot = vi.fn<() => Promise<TicketWorkspaceFixturePresentation>>()
const matchFixtureSelection =
  vi.fn<
    (selection: TicketWorkspaceFixtureSelection) => Promise<TicketWorkspaceFixtureMatchResponse>
  >()
const rebindFixtureSelection =
  vi.fn<
    (selection: TicketWorkspaceFixtureSelection) => Promise<TicketWorkspaceFixtureRebindResponse>
  >()
const activation = vi.hoisted(() => ({ activateAndRevealWorkspace: vi.fn() }))

vi.mock('@/lib/worktree-activation', () => activation)

let originalApiDescriptor: PropertyDescriptor | undefined
let originalOffsetHeight: PropertyDescriptor | undefined
let originalScrollTo: PropertyDescriptor | undefined

function fixture(tickets: TicketWorkspaceFixtureTicket[]): TicketWorkspaceFixturePresentation {
  return {
    status: 'fixture',
    provenance: {
      kind: 'fixture',
      snapshotCaseId: 'accepted-full-snapshot',
      snapshotRevision: 'a'.repeat(64)
    },
    orcaMatch: { status: 'not-evaluated' },
    tickets
  }
}

function ticket(
  ticketKey: string,
  label: string,
  workspaces: TicketWorkspaceFixtureTicket['workspaces'] = []
): TicketWorkspaceFixtureTicket {
  return {
    ticketKey,
    label,
    lifecycle: 'ready',
    availability: 'available',
    coordinatorTargetDeclared: true,
    workspaces
  }
}

beforeEach(() => {
  originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api')
  originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 240
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions | number) {
      this.scrollTop = typeof options === 'number' ? options : (options.top ?? 0)
      this.dispatchEvent(new Event('scroll'))
    }
  })
  getSnapshot.mockReset()
  matchFixtureSelection.mockReset().mockImplementation(async (selection) => ({
    status: 'unavailable',
    ...selection
  }))
  rebindFixtureSelection.mockReset().mockImplementation(async (selection) => ({
    status: 'unavailable',
    ...selection
  }))
  activation.activateAndRevealWorkspace.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ticketWorkspace: { getSnapshot, matchFixtureSelection, rebindFixtureSelection } }
  })
})

afterEach(() => {
  cleanup()
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  }
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  }
  if (originalApiDescriptor) {
    Object.defineProperty(window, 'api', originalApiDescriptor)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})

describe('TicketWorkspaceFixtureView', () => {
  it('shows loading, historical fixture rows and a read-only workspace preview', async () => {
    let resolveSnapshot: (value: TicketWorkspaceFixturePresentation) => void = () => undefined
    getSnapshot.mockImplementation(() => new Promise((resolve) => (resolveSnapshot = resolve)))
    render(<TicketWorkspaceFixtureView />)

    expect(screen.getByText('Loading ticket fixture…')).toBeTruthy()
    await act(async () => {
      resolveSnapshot(
        fixture([
          ticket('ORCA-7', 'A long ticket title that stays inside the sidebar width', [
            {
              repositoryId: 'common-api',
              label: 'A long workspace name that stays inside the sidebar width',
              role: 'referenced',
              actualState: 'ready'
            }
          ])
        ])
      )
    })

    expect(screen.getByText(/Historical fixture · accepted-full-snapshot/)).toBeTruthy()
    expect(screen.getByRole('option', { name: /Select ORCA-7:/ })).toBeTruthy()
    expect(screen.getByText('Fixture lifecycle')).toBeTruthy()
    expect(screen.getByText(/no Run is verified/)).toBeTruthy()
    const workspaceList = screen.getByRole('listbox', { name: 'Workspace records' })
    const workspaceOption = screen.getByRole('option', { name: /common-api/ })
    expect(workspaceOption.getAttribute('aria-label')).toContain('Fixture state: ready')
    expect(workspaceOption.classList.contains('bg-worktree-sidebar-accent')).toBe(true)
    expect(workspaceOption.classList.contains('text-worktree-sidebar-accent-foreground')).toBe(true)
    expect(workspaceOption.classList.contains('ring-1')).toBe(true)
    expect(workspaceOption.classList.contains('ring-inset')).toBe(true)
    expect(workspaceOption.classList.contains('ring-worktree-sidebar-foreground/70')).toBe(true)
    expect(
      workspaceOption
        .querySelector('span:last-child')
        ?.classList.contains('text-worktree-sidebar-accent-foreground')
    ).toBe(true)
    expect(workspaceList.classList.contains('focus-visible:ring-2')).toBe(true)
    expect(
      workspaceList.classList.contains('focus-visible:ring-worktree-sidebar-foreground/70')
    ).toBe(true)
    const ticketList = screen.getByRole('listbox', { name: 'Tickets' })
    const ticketOption = screen.getByRole('option', { name: /Select ORCA-7:/ })
    expect(ticketOption.classList.contains('bg-worktree-sidebar-accent')).toBe(true)
    expect(ticketOption.classList.contains('ring-worktree-sidebar-foreground/70')).toBe(true)
    expect(
      ticketOption
        .querySelector('span:last-child')
        ?.classList.contains('text-worktree-sidebar-accent-foreground')
    ).toBe(true)
    expect(ticketList.classList.contains('focus-visible:ring-2')).toBe(true)
    expect(ticketList.classList.contains('focus-visible:ring-worktree-sidebar-foreground/70')).toBe(
      true
    )
    expect(
      screen
        .getByText('It does not show current workspace status.')
        .parentElement?.classList.contains('text-worktree-sidebar-foreground')
    ).toBe(true)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('selects and previews ticket and workspace records beyond index 100', async () => {
    const manyWorkspaces = Array.from({ length: 151 }, (_, index) => ({
      repositoryId: `repo-${index + 1}`,
      label: `Workspace ${index + 1}`,
      role: 'referenced' as const,
      actualState: 'ready' as const
    }))
    const tickets = Array.from({ length: 121 }, (_, index) =>
      ticket(`ORCA-${index + 1}`, `Ticket ${index + 1}`, index === 120 ? manyWorkspaces : [])
    )
    getSnapshot.mockResolvedValue(fixture(tickets))
    render(<TicketWorkspaceFixtureView />)

    const ticketList = await screen.findByRole('listbox', { name: 'Tickets' })
    ticketList.focus()
    await userEvent.setup().keyboard('{End}')

    const lastTicket = await screen.findByRole('option', { name: /Select ORCA-121: Ticket 121/ })
    expect(lastTicket.getAttribute('aria-posinset')).toBe('121')
    expect(lastTicket.getAttribute('aria-setsize')).toBe('121')
    expect(lastTicket.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Ticket 121' })).toBeTruthy()
    expect(
      screen
        .getByRole('option', { name: /Select ORCA-1:/ })
        .querySelector('span:last-child')
        ?.classList.contains('text-worktree-sidebar-foreground')
    ).toBe(true)

    const workspaceList = screen.getByRole('listbox', { name: 'Workspace records' })
    workspaceList.focus()
    await userEvent.setup().keyboard('{End}')

    const lastWorkspace = await screen.findByRole('option', { name: /Workspace 151, repo-151/ })
    expect(lastWorkspace.getAttribute('aria-posinset')).toBe('151')
    expect(lastWorkspace.getAttribute('aria-setsize')).toBe('151')
    expect(lastWorkspace.getAttribute('aria-selected')).toBe('true')
    expect(
      screen
        .getByRole('option', { name: /Workspace 1, repo-1/ })
        .querySelector('span:last-child')
        ?.classList.contains('text-worktree-sidebar-foreground')
    ).toBe(true)
  })

  it('shows explicit empty and unavailable states', async () => {
    getSnapshot.mockResolvedValueOnce(fixture([]))
    const empty = render(<TicketWorkspaceFixtureView />)
    expect(await screen.findByText('No tickets in this fixture snapshot.')).toBeTruthy()
    empty.unmount()

    getSnapshot.mockResolvedValueOnce({
      status: 'unavailable',
      scope: 'tickets-only',
      provenance: { kind: 'fixture' },
      orcaMatch: { status: 'not-evaluated' }
    })
    render(<TicketWorkspaceFixtureView />)
    expect(await screen.findByText('Ticket snapshot unavailable.')).toBeTruthy()

    getSnapshot.mockRejectedValueOnce(new Error('fixture transport unavailable'))
    cleanup()
    render(<TicketWorkspaceFixtureView />)
    expect(await screen.findByText('Ticket snapshot unavailable.')).toBeTruthy()
  })

  it('does not announce an unavailable snapshot after the view unmounts', async () => {
    let rejectSnapshot: (error: Error) => void = () => undefined
    getSnapshot.mockImplementation(() => new Promise((_, reject) => (rejectSnapshot = reject)))
    const onUnavailable = vi.fn()
    const view = render(<TicketWorkspaceFixtureView onUnavailable={onUnavailable} />)
    view.unmount()

    await act(async () => rejectSnapshot(new Error('closed')))
    expect(onUnavailable).not.toHaveBeenCalled()
  })

  it('ignores a delayed click rebind after the selected workspace changes', async () => {
    let resolveRebind: (response: TicketWorkspaceFixtureRebindResponse) => void = () => undefined
    rebindFixtureSelection.mockImplementationOnce(
      () => new Promise((resolve) => (resolveRebind = resolve))
    )
    getSnapshot.mockResolvedValue(
      fixture([
        ticket('ORCA-7', 'Ticket 7', [
          {
            repositoryId: 'repo-a',
            label: 'Workspace A',
            role: 'referenced',
            actualState: 'ready'
          },
          { repositoryId: 'repo-b', label: 'Workspace B', role: 'referenced', actualState: 'ready' }
        ])
      ])
    )
    const user = userEvent.setup()
    render(<TicketWorkspaceFixtureView />)

    const firstOption = await screen.findByRole('option', { name: /Workspace A, repo-a/ })
    await user.click(firstOption)
    await waitFor(() => expect(rebindFixtureSelection).toHaveBeenCalledOnce())

    const workspaceList = screen.getByRole('listbox', { name: 'Workspace records' })
    workspaceList.focus()
    await user.keyboard('{ArrowDown}')
    expect(
      screen.getByRole('option', { name: /Workspace B, repo-b/ }).getAttribute('aria-selected')
    ).toBe('true')

    const selection = rebindFixtureSelection.mock.calls[0]?.[0]
    if (!selection) {
      throw new Error('Expected the click to use a fixture selector.')
    }
    await act(async () => {
      resolveRebind({
        status: 'rebound',
        ...selection,
        worktreeId: 'repo-a::/repo/worktree'
      })
    })
    expect(activation.activateAndRevealWorkspace).not.toHaveBeenCalled()
  })
})
