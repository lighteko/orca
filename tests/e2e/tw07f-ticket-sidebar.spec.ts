import { expect, test } from './helpers/orca-app'

test.use({ orcaAppExtraEnv: { ORCA_BACKGROUND_LAUNCH: '1' } })

test('renders the bundled ticket snapshot in the hidden sidebar', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  const windowState = await electronApp.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows()
    return {
      windowCount: windows.length,
      visibleWindowCount: windows.filter((window) => window.isVisible()).length
    }
  })
  expect(windowState.windowCount).toBeGreaterThan(0)
  expect(windowState.visibleWindowCount).toBe(0)

  await orcaPage
    .getByRole('tab', { name: 'Tickets', exact: true })
    .dispatchEvent('mousedown', { button: 0, ctrlKey: false, bubbles: true })

  const fixture = orcaPage.locator('[data-ticket-fixture-view]')
  await expect(fixture).toBeVisible()
  await expect(fixture.locator('[data-snapshot-case-id]')).toHaveAttribute(
    'data-snapshot-case-id',
    'accepted-full-snapshot'
  )
  await expect(fixture).toContainText('SEL-1 Fixture ticket')

  const headerActions = orcaPage.locator('[data-sidebar-header-actions]')
  await expect(headerActions.getByRole('button', { name: 'Add project', exact: true })).toHaveCount(
    0
  )
  await expect(
    headerActions.locator('[data-contextual-tour-target="workspace-create-control"]')
  ).toHaveCount(0)
  await expect(headerActions.locator('button[aria-label^="Workspace options"]')).toHaveCount(0)
  await expect(orcaPage.locator('[data-workspace-board-trigger]')).toHaveCount(0)
  await expect(orcaPage.locator('[data-setup-script-prompt-layer]')).toHaveCount(0)
  await expect(orcaPage.locator('[data-native-file-drop-target="project-sidebar"]')).toHaveCount(0)

  const visibleWindowCountBeforeScreenshot = await electronApp.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((window) => window.isVisible()).length
  )
  expect(visibleWindowCountBeforeScreenshot).toBe(0)

  await orcaPage.screenshot({
    path: testInfo.outputPath('tw07f-m5-ticket-sidebar.png'),
    animations: 'disabled'
  })
})
