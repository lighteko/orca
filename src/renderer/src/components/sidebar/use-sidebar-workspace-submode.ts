import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { useWorkspaceRevealBodyRedirect } from './use-workspace-reveal-body-redirect'
import type { WorkspaceSubmode } from './WorkspaceSubmodeTabs'

export function useSidebarWorkspaceSubmode(): {
  mode: WorkspaceSubmode
  setMode: (mode: WorkspaceSubmode) => void
  unavailableNotice: boolean
  showUnavailable: () => void
} {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const sidebarBody = useAppStore((state) => state.sidebarBody ?? 'workspaces')
  const setSidebarBody = useAppStore((state) => state.setSidebarBody)
  const pendingRevealWorktree = useAppStore((state) => state.pendingRevealWorktree)
  const pendingRevealSidebarRow = useAppStore((state) => state.pendingRevealSidebarRow)
  const [mode, setModeState] = useState<WorkspaceSubmode>('projects')
  const [unavailableNotice, setUnavailableNotice] = useState(false)
  const setMode = useCallback((nextMode: WorkspaceSubmode) => {
    setModeState(nextMode)
    if (nextMode === 'tickets') {
      setUnavailableNotice(false)
    }
  }, [])
  const showUnavailable = useCallback(() => {
    setModeState('projects')
    setUnavailableNotice(true)
  }, [])
  const revealPending = pendingRevealWorktree !== null || pendingRevealSidebarRow !== null
  const visibleMode = mode === 'tickets' && revealPending ? 'projects' : mode

  const showProjectsForReveal = useCallback(() => {
    setModeState('projects')
    if (sidebarBody === 'agents') {
      setSidebarBody?.('workspaces')
    }
  }, [setSidebarBody, sidebarBody])

  useWorkspaceRevealBodyRedirect(
    sidebarOpen &&
      (sidebarBody === 'agents' || (sidebarBody === 'workspaces' && visibleMode === 'tickets')),
    showProjectsForReveal
  )

  useEffect(() => {
    if (mode === 'tickets' && revealPending) {
      setModeState('projects')
    }
  }, [mode, revealPending])

  return { mode: visibleMode, setMode, unavailableNotice, showUnavailable }
}
