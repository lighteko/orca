// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL,
  TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL,
  type TicketWorkspaceFixtureSelection
} from '../../../../shared/ticket-workspace-owner-binding-boundary'
import {
  installOwnerBindingTestAccessor,
  installTicketWorkspacePresentation,
  loadTicketWorkspaceFixtureTestApi,
  selectionForFixturePresentation,
  syntheticTicketWorkspacePresentation
} from './ticket-workspace-navigation-test-harness'

const bridge = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel)
    if (!handler) {
      throw new Error('missing_test_ipc_handler')
    }
    return handler(...args)
  })
  return { handlers, invoke }
})
const activation = vi.hoisted(() => ({ activateAndRevealWorkspace: vi.fn() }))
const fixtureApi = await loadTicketWorkspaceFixtureTestApi()

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  ipcRenderer: { invoke: bridge.invoke }
}))
vi.mock('../../../../main/startup/main-process-state', () => ({
  mainProcessState: { runtime: null }
}))
vi.mock('../../../../main/ticket-workspace/ticket-workspace-fixture-service', () => ({
  loadValidatedFixture: vi.fn()
}))
vi.mock('@/lib/worktree-activation', () => activation)

const { default: TicketWorkspaceFixtureView } = await import('./TicketWorkspaceFixtureView')

let originalApiDescriptor: PropertyDescriptor | undefined
let originalOffsetHeight: PropertyDescriptor | undefined
let originalScrollTo: PropertyDescriptor | undefined

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
  bridge.handlers.clear()
  bridge.invoke.mockReset()
  bridge.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    const handler = bridge.handlers.get(channel)
    if (!handler) {
      throw new Error('missing_test_ipc_handler')
    }
    return handler(...args)
  })
  activation.activateAndRevealWorkspace.mockReset()
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

describe('ticket fixture navigation through the reviewed bridge', () => {
  it('activates only the exact Orca ID returned from a fresh synthetic match', async () => {
    const { snapshot } = fixtureApi.makePositiveTicketWorkspaceSnapshot({
      referenceState: 'unavailable'
    })
    const presentation = syntheticTicketWorkspacePresentation(
      snapshot,
      'synthetic-positive-owner-match'
    )
    const selection = selectionForFixturePresentation(presentation)
    const harness = await installOwnerBindingTestAccessor(snapshot, bridge.handlers, fixtureApi)
    await installTicketWorkspacePresentation(presentation)
    const user = userEvent.setup()

    render(<TicketWorkspaceFixtureView />)
    expect(await screen.findByRole('status')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('exact workspace match')
    )
    expect(bridge.invoke).toHaveBeenCalledWith(TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL, selection)

    await user.click(screen.getByRole('option', { name: /common-api/ }))
    await waitFor(() =>
      expect(activation.activateAndRevealWorkspace).toHaveBeenCalledWith(
        fixtureApi.OWNER_TEST_WORKTREE_ID,
        { executionHostId: 'local' }
      )
    )

    expect(activation.activateAndRevealWorkspace).toHaveBeenCalledOnce()
    expect(harness.getListCallCount()).toBe(3)
    expectSelectorOnlyBridgeCalls(selection)
  })

  it('keeps the shipped full fixture unavailable and never activates a workspace', async () => {
    const snapshot = fixtureApi.validatedFullTicketSnapshot()
    const presentation = syntheticTicketWorkspacePresentation(snapshot, 'accepted-full-snapshot')
    const selection = selectionForFixturePresentation(presentation)
    const harness = await installOwnerBindingTestAccessor(snapshot, bridge.handlers, fixtureApi)
    await installTicketWorkspacePresentation(presentation)
    const user = userEvent.setup()

    render(<TicketWorkspaceFixtureView />)
    expect(await screen.findByText('No exact Orca workspace match is available.')).toBeTruthy()
    await user.click(screen.getByRole('option', { name: /common-api/ }))

    await waitFor(() =>
      expect(bridge.invoke).toHaveBeenCalledWith(TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL, selection)
    )
    expect(activation.activateAndRevealWorkspace).not.toHaveBeenCalled()
    expect(harness.getListCallCount()).toBe(0)
  })

  it.each([
    ['snapshot revision changed', 'revision'],
    ['target host changed', 'host'],
    ['target instance changed', 'instance']
  ] as const)('does not activate after a %s result', async (_name, change) => {
    const initial = fixtureApi.makePositiveTicketWorkspaceSnapshot({
      referenceState: 'unavailable'
    }).snapshot
    const current =
      change === 'revision'
        ? fixtureApi.makePositiveTicketWorkspaceSnapshot({
            worktreePath: '/repo/revision-changed'
          }).snapshot
        : change === 'host'
          ? fixtureApi.makePositiveTicketWorkspaceSnapshot({ executionHostId: 'ssh:builder' })
              .snapshot
          : fixtureApi.makePositiveTicketWorkspaceSnapshot({ instanceId: 'instance-2' }).snapshot
    const presentation = syntheticTicketWorkspacePresentation(
      change === 'revision' ? initial : current,
      `before-${change}-change`
    )
    const selection = selectionForFixturePresentation(presentation)
    const harness = await installOwnerBindingTestAccessor(current, bridge.handlers, fixtureApi)
    await installTicketWorkspacePresentation(presentation)
    const user = userEvent.setup()

    render(<TicketWorkspaceFixtureView />)
    await screen.findByRole('option', { name: /common-api/ })
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'No exact Orca workspace match is available.'
      )
    )
    await user.click(screen.getByRole('option', { name: /common-api/ }))

    await waitFor(() =>
      expect(bridge.invoke).toHaveBeenCalledWith(TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL, selection)
    )
    expect(activation.activateAndRevealWorkspace).not.toHaveBeenCalled()
    expectSelectorOnlyBridgeCalls(selection)
    expect(harness.getListCallCount()).toBe(change === 'instance' ? 2 : 0)
  })
})

function expectSelectorOnlyBridgeCalls(expected: TicketWorkspaceFixtureSelection): void {
  const calls = bridge.invoke.mock.calls.filter(
    ([channel]) =>
      channel === TICKET_WORKSPACE_FIXTURE_MATCH_CHANNEL ||
      channel === TICKET_WORKSPACE_FIXTURE_REBIND_CHANNEL
  )
  expect(calls.map(([, ...args]) => args)).toEqual([[expected], [expected]])
  expect(calls.every(([, ...args]) => args.length === 1 && hasThreeSelectorKeys(args[0]))).toBe(
    true
  )
}

function hasThreeSelectorKeys(value: unknown): boolean {
  return value !== null && typeof value === 'object' && Object.keys(value).length === 3
}
