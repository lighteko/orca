// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SidebarHeaderActions } from './sidebar-header-actions'

describe('SidebarHeaderActions', () => {
  it('hides project and workspace creation controls in the Tickets view', () => {
    render(
      <SidebarHeaderActions onWorkspaceBoardMenuOpenChange={() => undefined} ticketsViewActive />
    )

    expect(screen.queryByRole('button', { name: 'Add project' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New workspace' })).toBeNull()
  })
})
