// @vitest-environment happy-dom

import { useState, type JSX } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WorkspaceSubmodeTabs, type WorkspaceSubmode } from './WorkspaceSubmodeTabs'

function TabsHarness(): JSX.Element {
  const [value, setValue] = useState<WorkspaceSubmode>('projects')
  return (
    <WorkspaceSubmodeTabs
      value={value}
      onChange={setValue}
      ticketSnapshotUnavailable={false}
      projects={<div>Project rows</div>}
      tickets={<div>Ticket rows</div>}
    />
  )
}

describe('WorkspaceSubmodeTabs', () => {
  it('connects each tab to its panel and switches by keyboard without losing focus', async () => {
    const user = userEvent.setup()
    render(<TabsHarness />)

    const projectsTab = screen.getByRole('tab', { name: 'Projects' })
    const sidebarTheme = screen.getByRole('tablist').parentElement?.parentElement
    expect(sidebarTheme?.classList.contains('bg-worktree-sidebar')).toBe(true)
    expect(
      sidebarTheme?.classList.contains(
        '[&_[data-slot=tabs-trigger]]:text-worktree-sidebar-foreground'
      )
    ).toBe(true)
    expect(
      sidebarTheme?.classList.contains(
        '[&_[data-slot=tabs-trigger][data-state=active]]:bg-worktree-sidebar-accent'
      )
    ).toBe(true)
    expect(
      sidebarTheme?.classList.contains(
        '[&_[data-slot=tabs-trigger]:focus-visible]:ring-worktree-sidebar-foreground/70'
      )
    ).toBe(true)
    const projectsPanel = screen.getByRole('tabpanel')
    expect(projectsTab.getAttribute('aria-controls')).toBe(projectsPanel.id)
    expect(projectsPanel.getAttribute('aria-labelledby')).toBe(projectsTab.id)
    expect(within(projectsPanel).getByText('Project rows')).toBeTruthy()

    projectsTab.focus()
    await user.keyboard('{ArrowRight}')

    const ticketsTab = screen.getByRole('tab', { name: 'Tickets' })
    expect(ticketsTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(ticketsTab)
    const ticketsPanel = screen.getByRole('tabpanel')
    expect(ticketsTab.getAttribute('aria-controls')).toBe(ticketsPanel.id)
    expect(ticketsPanel.getAttribute('aria-labelledby')).toBe(ticketsTab.id)
    expect(within(ticketsPanel).getByText('Ticket rows')).toBeTruthy()
  })
})
