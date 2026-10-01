// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { tmpdir } from 'node:os'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { TicketWorkspaceFixturePresentation } from '../../../../shared/ticket-workspace-fixture-boundary'
import type { GlobalSettings } from '../../../../shared/global-settings-types'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  closeWorkspaceBoard: vi.fn(),
  projectDropEnabled: true,
  projectDropHandlers: {
    onDragEnter: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn()
  },
  panel: {
    workspaceBoardOpen: false,
    workspaceBoardRenderedOpen: true,
    workspaceBoardDragPreviewOpen: false
  }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/hooks/useSidebarResize', () => ({
  useSidebarResize: () => ({
    containerRef: { current: null },
    isResizing: false,
    onResizeStart: vi.fn()
  })
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./SidebarHeader', () => ({ default: () => <div data-testid="sidebar-header" /> }))
vi.mock('./SidebarAgentsList', () => ({ default: () => <div data-testid="sidebar-agents-list" /> }))
vi.mock('./SidebarNav', () => ({ default: () => <div data-testid="sidebar-nav" /> }))
vi.mock('./SetupScriptPromptCard', () => ({
  default: () => (
    <div data-testid="setup-prompt">
      <button type="button">Save detected setup</button>
    </div>
  )
}))
vi.mock('./WorktreeList', () => ({ default: () => <div data-testid="worktree-list" /> }))
vi.mock('./SidebarToolbar', () => ({
  default: ({ showWorkspaceBoardToggle = true }: { showWorkspaceBoardToggle?: boolean }) => (
    <div data-testid="sidebar-toolbar">
      {showWorkspaceBoardToggle ? <button data-testid="workspace-board-trigger" /> : null}
    </div>
  )
}))
vi.mock('./WorkspaceKanbanDrawer', () => ({
  default: () => <div data-testid="workspace-kanban-drawer" />
}))
vi.mock('./useSidebarProjectDrop', () => ({
  useSidebarProjectDrop: (enabled = true) => {
    mocks.projectDropEnabled = enabled
    return {
      nativeDropTarget: 'project-sidebar',
      dropHandlers: mocks.projectDropHandlers,
      affordance: { visible: false }
    }
  }
}))
vi.mock('./useWorkspaceBoardPanel', () => ({
  useWorkspaceBoardPanel: () => ({
    ...mocks.panel,
    workspaceBoardMenuOpen: false,
    toggleWorkspaceBoard: vi.fn(),
    handleWorkspaceBoardOpenChange: vi.fn(),
    setWorkspaceBoardMenuOpen: vi.fn(),
    closeWorkspaceBoard: mocks.closeWorkspaceBoard,
    previewWorkspaceBoardFromDrag: vi.fn(),
    solidifyWorkspaceBoardFromDrag: vi.fn(),
    cancelWorkspaceBoardDragPreview: vi.fn()
  })
}))

import Sidebar from './index'

const getSnapshot = vi.fn<() => Promise<TicketWorkspaceFixturePresentation>>()
let originalApiDescriptor: PropertyDescriptor | undefined

const fixtureSnapshot: TicketWorkspaceFixturePresentation = {
  status: 'fixture',
  provenance: {
    kind: 'fixture',
    snapshotCaseId: 'sidebar-test-fixture',
    snapshotRevision: 'a'.repeat(64)
  },
  orcaMatch: { status: 'not-evaluated' },
  tickets: []
}

function setSidebarState(settings: GlobalSettings): void {
  mocks.state = {
    activeModal: null,
    agentDashboardDrawerOpen: false,
    setAgentDashboardDrawerOpen: vi.fn(),
    fetchAllWorktrees: vi.fn(),
    repos: [],
    setSidebarWidth: vi.fn(),
    settings,
    sidebarOpen: true,
    sidebarWidth: 320,
    sidebarBody: 'workspaces',
    pendingRevealWorktree: null,
    pendingRevealSidebarRow: null,
    setSidebarBody: vi.fn(),
    statusBarVisible: true
  }
}

function sidebarElement(): ReactNode {
  return (
    <Sidebar worktreeScrollOffsetRef={{ current: 0 }} worktreeScrollAnchorRef={{ current: null }} />
  )
}

beforeEach(() => {
  originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api')
  getSnapshot.mockReset().mockResolvedValue(fixtureSnapshot)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ticketWorkspace: { getSnapshot } }
  })
  mocks.closeWorkspaceBoard.mockClear()
  mocks.projectDropEnabled = true
  Object.values(mocks.projectDropHandlers).forEach((handler) => handler.mockClear())
  mocks.panel = {
    workspaceBoardOpen: false,
    workspaceBoardRenderedOpen: true,
    workspaceBoardDragPreviewOpen: false
  }
})

afterEach(() => {
  cleanup()
  if (originalApiDescriptor) {
    Object.defineProperty(window, 'api', originalApiDescriptor)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})

describe('Sidebar workspace submode', () => {
  it('switches to the ticket fixture view while keeping Projects available', async () => {
    setSidebarState(getDefaultSettings(tmpdir()))
    const user = userEvent.setup()
    const view = render(sidebarElement())

    expect(view.getByTestId('worktree-list')).toBeTruthy()
    expect(view.getByTestId('setup-prompt')).toBeTruthy()
    expect(view.getByRole('button', { name: 'Save detected setup' })).toBeTruthy()
    await user.click(view.getByRole('tab', { name: 'Tickets' }))
    expect(await view.findByText(/Historical fixture · sidebar-test-fixture/)).toBeTruthy()
    expect(view.queryByTestId('worktree-list')).toBeNull()
    expect(view.queryByTestId('setup-prompt')).toBeNull()
    expect(view.queryByRole('button', { name: 'Save detected setup' })).toBeNull()
    await user.click(view.getByRole('tab', { name: 'Projects' }))
    expect(view.getByTestId('worktree-list')).toBeTruthy()
    expect(view.getByTestId('setup-prompt')).toBeTruthy()
    expect(view.getByRole('button', { name: 'Save detected setup' })).toBeTruthy()
  })

  it('returns to Projects before rendering a store-initiated workspace reveal', async () => {
    setSidebarState(getDefaultSettings(tmpdir()))
    const user = userEvent.setup()
    const view = render(sidebarElement())
    await user.click(view.getByRole('tab', { name: 'Tickets' }))
    expect(await view.findByText(/Historical fixture · sidebar-test-fixture/)).toBeTruthy()

    mocks.state.pendingRevealWorktree = {
      worktreeId: 'repo-1::/feature',
      behavior: 'auto',
      highlight: true
    }
    view.rerender(sidebarElement())

    expect(view.getByTestId('worktree-list')).toBeTruthy()
    expect(view.getByRole('tab', { name: 'Projects' }).getAttribute('aria-selected')).toBe('true')
  })

  it('closes and hides Projects drop and board controls in Tickets, then restores them', async () => {
    setSidebarState(getDefaultSettings(tmpdir()))
    mocks.panel = {
      workspaceBoardOpen: true,
      workspaceBoardRenderedOpen: true,
      workspaceBoardDragPreviewOpen: false
    }
    const user = userEvent.setup()
    const view = render(sidebarElement())
    const root = view.container.firstElementChild

    expect(root?.getAttribute('data-native-file-drop-target')).toBe('project-sidebar')
    expect(view.getByTestId('workspace-board-trigger')).toBeTruthy()
    expect(view.getByTestId('workspace-kanban-drawer')).toBeTruthy()
    await user.click(view.getByRole('tab', { name: 'Tickets' }))

    expect(mocks.projectDropEnabled).toBe(false)
    expect(root?.getAttribute('data-native-file-drop-target')).toBeNull()
    if (root) {
      fireEvent.dragOver(root)
    }
    expect(mocks.projectDropHandlers.onDragOver).not.toHaveBeenCalled()
    expect(view.queryByTestId('workspace-board-trigger')).toBeNull()
    expect(view.queryByTestId('workspace-kanban-drawer')).toBeNull()
    await waitFor(() => expect(mocks.closeWorkspaceBoard).toHaveBeenCalledOnce())

    mocks.panel.workspaceBoardOpen = false
    mocks.panel.workspaceBoardRenderedOpen = false
    view.rerender(sidebarElement())
    await user.click(view.getByRole('tab', { name: 'Projects' }))

    expect(mocks.projectDropEnabled).toBe(true)
    expect(root?.getAttribute('data-native-file-drop-target')).toBe('project-sidebar')
    expect(view.getByTestId('workspace-board-trigger')).toBeTruthy()
  })

  it.each([
    [
      'resolved unavailable',
      () => {
        getSnapshot.mockResolvedValueOnce({
          status: 'unavailable',
          scope: 'tickets-only',
          provenance: { kind: 'fixture' },
          orcaMatch: { status: 'not-evaluated' }
        })
      }
    ],
    [
      'rejected load',
      () => {
        getSnapshot.mockRejectedValueOnce(new Error('snapshot transport unavailable'))
      }
    ]
  ])('returns to Projects with an accessible notice after a %s result', async (_name, setup) => {
    setSidebarState(getDefaultSettings(tmpdir()))
    setup()
    const user = userEvent.setup()
    const view = render(sidebarElement())

    await user.click(view.getByRole('tab', { name: 'Tickets' }))

    const notice = await view.findByRole('status')
    expect(notice.textContent).toBe('Ticket snapshot unavailable.')
    expect(view.getByRole('tab', { name: 'Projects' }).getAttribute('aria-selected')).toBe('true')
    expect(view.getByTestId('worktree-list')).toBeTruthy()
    expect(view.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      view.getByRole('tab', { name: 'Projects' }).id
    )
  })
})
