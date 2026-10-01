// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { TicketWorkspaceFixturePresentation } from '../../../../shared/ticket-workspace-fixture-boundary'
import type { TicketWorkspaceFixtureSelection } from '../../../../shared/ticket-workspace-owner-binding-boundary'

const api = vi.hoisted(() => ({
  getSnapshot: vi.fn<() => Promise<TicketWorkspaceFixturePresentation>>(),
  matchFixtureSelection: vi.fn<
    (selection: TicketWorkspaceFixtureSelection) => Promise<{
      status: 'unavailable'
      snapshotRevision: string
      ticketKey: string
      repositoryId: string
    }>
  >(),
  rebindFixtureSelection: vi.fn<(selection: TicketWorkspaceFixtureSelection) => Promise<never>>()
}))
const activation = vi.hoisted(() => ({ activateAndRevealWorkspace: vi.fn() }))

vi.mock('@/lib/worktree-activation', () => activation)

import TicketWorkspaceFixtureView from './TicketWorkspaceFixtureView'

let originalApi: PropertyDescriptor | undefined
let originalOffsetHeight: PropertyDescriptor | undefined
let originalScrollTo: PropertyDescriptor | undefined

beforeEach(() => {
  originalApi = Object.getOwnPropertyDescriptor(window, 'api')
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
  api.getSnapshot.mockResolvedValue({
    status: 'fixture',
    provenance: {
      kind: 'fixture',
      snapshotCaseId: 'rejected-click',
      snapshotRevision: 'a'.repeat(64)
    },
    orcaMatch: { status: 'not-evaluated' },
    tickets: [
      {
        ticketKey: 'ORCA-7',
        label: 'Ticket 7',
        lifecycle: 'ready',
        availability: 'available',
        coordinatorTargetDeclared: false,
        workspaces: [
          {
            repositoryId: 'repo-a',
            label: 'Workspace A',
            role: 'referenced',
            actualState: 'ready'
          }
        ]
      }
    ]
  })
  api.matchFixtureSelection.mockImplementation(async (selection) => ({
    status: 'unavailable',
    ...selection
  }))
  api.rebindFixtureSelection.mockRejectedValue(new Error('bridge unavailable'))
  activation.activateAndRevealWorkspace.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ticketWorkspace: api }
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
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})

it('does not activate a workspace after the click rebind rejects', async () => {
  const user = userEvent.setup()
  render(<TicketWorkspaceFixtureView />)
  await user.click(await screen.findByRole('option', { name: /Workspace A, repo-a/ }))
  await waitFor(() => expect(api.rebindFixtureSelection).toHaveBeenCalledOnce())
  expect(activation.activateAndRevealWorkspace).not.toHaveBeenCalled()
})
