import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'

export type WorkspaceSubmode = 'projects' | 'tickets'

type WorkspaceSubmodeTabsProps = {
  value: WorkspaceSubmode
  onChange: (value: WorkspaceSubmode) => void
  projects: ReactNode
  tickets: ReactNode
  ticketSnapshotUnavailable: boolean
}

export function WorkspaceSubmodeTabs({
  value,
  onChange,
  projects,
  tickets,
  ticketSnapshotUnavailable
}: WorkspaceSubmodeTabsProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-worktree-sidebar text-worktree-sidebar-foreground [&_[data-slot=tabs-list]]:bg-worktree-sidebar [&_[data-slot=tabs-list]]:text-worktree-sidebar-foreground [&_[data-slot=tabs-trigger]]:text-worktree-sidebar-foreground [&_[data-slot=tabs-trigger]:hover]:text-worktree-sidebar-foreground [&_[data-slot=tabs-trigger]:focus-visible]:border-worktree-sidebar-foreground/70 [&_[data-slot=tabs-trigger]:focus-visible]:outline-worktree-sidebar-foreground/70 [&_[data-slot=tabs-trigger]:focus-visible]:ring-worktree-sidebar-foreground/70 [&_[data-slot=tabs-trigger][data-state=active]]:bg-worktree-sidebar-accent [&_[data-slot=tabs-trigger][data-state=active]]:text-worktree-sidebar-accent-foreground dark:[&_[data-slot=tabs-trigger]]:text-worktree-sidebar-foreground dark:[&_[data-slot=tabs-trigger][data-state=active]]:bg-worktree-sidebar-accent dark:[&_[data-slot=tabs-trigger][data-state=active]]:text-worktree-sidebar-accent-foreground">
      <Tabs
        value={value}
        onValueChange={(next) => {
          if (next === 'projects' || next === 'tickets') {
            onChange(next)
          }
        }}
        className="mx-2 mt-1 min-h-0 min-w-0 flex-1"
      >
        <TabsList
          aria-label={translate('ticketWorkspace.sidebar.mode', 'Workspace view')}
          className="h-8 w-full shrink-0"
        >
          <TabsTrigger value="projects" className="min-w-0">
            {translate('ticketWorkspace.sidebar.projects', 'Projects')}
          </TabsTrigger>
          <TabsTrigger value="tickets" className="min-w-0">
            {translate('ticketWorkspace.sidebar.tickets', 'Tickets')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="projects" className="flex min-h-0 flex-col overflow-hidden">
          {ticketSnapshotUnavailable ? (
            <div className="px-2 py-1 text-xs text-worktree-sidebar-foreground" role="status">
              {translate('ticketWorkspace.sidebar.unavailable', 'Ticket snapshot unavailable.')}
            </div>
          ) : null}
          {projects}
        </TabsContent>
        <TabsContent value="tickets" className="flex min-h-0 flex-col overflow-hidden">
          {tickets}
        </TabsContent>
      </Tabs>
    </div>
  )
}
