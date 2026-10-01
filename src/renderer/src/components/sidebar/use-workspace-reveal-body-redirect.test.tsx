// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT } from '@/lib/scroll-to-current-workspace-status'
import { useWorkspaceRevealBodyRedirect } from './use-workspace-reveal-body-redirect'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ setSidebarBody: vi.fn() }))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { setSidebarBody: typeof mocks.setSidebarBody }) => unknown) =>
    selector({ setSidebarBody: mocks.setSidebarBody })
}))

function Host({ rowsHidden, onShowRows }: { rowsHidden: boolean; onShowRows?: () => void }): null {
  useWorkspaceRevealBodyRedirect(rowsHidden, onShowRows)
  return null
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  mocks.setSidebarBody.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('useWorkspaceRevealBodyRedirect', () => {
  it('switches the body to Spaces and replays the request once the list is mounted', () => {
    act(() => {
      root.render(<Host rowsHidden />)
    })
    const seen: unknown[] = []
    const listener = (event: Event): void => {
      seen.push(event instanceof CustomEvent ? event.detail : null)
    }

    act(() => {
      window.dispatchEvent(
        new CustomEvent(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, {
          detail: { target: { type: 'active-workspace' }, beginRename: true }
        })
      )
    })
    expect(mocks.setSidebarBody).toHaveBeenCalledWith('workspaces')
    expect(seen).toEqual([])

    // The worktree list mounts (and registers its listener) when the body flips.
    window.addEventListener(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, listener)
    act(() => {
      root.render(<Host rowsHidden={false} />)
    })
    window.removeEventListener(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, listener)

    expect(seen).toEqual([{ target: { type: 'active-workspace' }, beginRename: true }])
  })

  it('does not intercept requests while Spaces is already showing', () => {
    act(() => {
      root.render(<Host rowsHidden={false} />)
    })
    act(() => {
      window.dispatchEvent(new CustomEvent(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT))
    })
    expect(mocks.setSidebarBody).not.toHaveBeenCalled()
  })

  it('uses the supplied Projects redirect before replaying a Tickets reveal', () => {
    const onShowRows = vi.fn()
    act(() => {
      root.render(<Host rowsHidden onShowRows={onShowRows} />)
    })
    const seen: unknown[] = []
    const listener = (event: Event): void => {
      seen.push(event instanceof CustomEvent ? event.detail : null)
    }

    act(() => {
      window.dispatchEvent(
        new CustomEvent(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, {
          detail: { target: { type: 'active-workspace' } }
        })
      )
    })
    expect(onShowRows).toHaveBeenCalledOnce()
    expect(mocks.setSidebarBody).not.toHaveBeenCalled()

    window.addEventListener(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, listener)
    act(() => {
      root.render(<Host rowsHidden={false} onShowRows={onShowRows} />)
    })
    window.removeEventListener(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, listener)

    expect(seen).toEqual([{ target: { type: 'active-workspace' } }])
  })
})
