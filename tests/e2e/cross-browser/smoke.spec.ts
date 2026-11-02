import { expect, test } from '@playwright/test'
import {
  expectNoHorizontalOverflow,
  gotoShowroom,
  trackRuntimeErrors,
} from '../helpers'

test('loads and opens the command palette', async ({ page }) => {
  const errors = trackRuntimeErrors(page)
  await gotoShowroom(page)
  await expectNoHorizontalOverflow(page)

  await page.keyboard.press('Control+k')
  const palette = page.locator('[data-command-palette]')
  await expect(palette).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Search commands' }),
  ).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
  await errors.assertClean()
})

test('keeps the mobile home page within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoShowroom(page)
  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
