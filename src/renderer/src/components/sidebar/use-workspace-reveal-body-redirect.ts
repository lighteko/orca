import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT } from '@/lib/scroll-to-current-workspace-status'

/**
 * Reveal requests are handled inside the worktree list, which is unmounted while
 * another sidebar view is showing. Capture the request and replay after it mounts.
 */
export function useWorkspaceRevealBodyRedirect(
  worktreeListHidden: boolean,
  onShowWorktreeList?: () => void
): void {
  const pendingDetailRef = useRef<{ detail: unknown } | null>(null)
  const setSidebarBody = useAppStore((s) => s.setSidebarBody)

  useEffect(() => {
    if (!worktreeListHidden) {
      return
    }
    const onRequest = (event: Event): void => {
      pendingDetailRef.current = { detail: event instanceof CustomEvent ? event.detail : undefined }
      if (onShowWorktreeList) {
        onShowWorktreeList()
      } else {
        setSidebarBody('workspaces')
      }
    }
    window.addEventListener(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, onRequest)
    return () => {
      window.removeEventListener(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, onRequest)
    }
  }, [onShowWorktreeList, setSidebarBody, worktreeListHidden])

  useEffect(() => {
    if (worktreeListHidden) {
      return
    }
    const pending = pendingDetailRef.current
    if (!pending) {
      return
    }
    pendingDetailRef.current = null
    // Why safe to replay synchronously: the worktree list is a child of the sidebar, so its
    // listener effect ran earlier in this same commit.
    window.dispatchEvent(
      new CustomEvent(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, { detail: pending.detail })
    )
  }, [worktreeListHidden])
}
