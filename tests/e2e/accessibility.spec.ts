import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  gotoShowroom,
  openPrismDarkroom,
} from './helpers'

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
}

test.describe('@a11y accessibility gate', () => {
  test('home has no accessibility violations', async ({ page }) => {
    await gotoShowroom(page)
    await expectNoAccessibilityViolations(page)
  })

  test('gallery has no accessibility violations', async ({ page }) => {
    await gotoShowroom(page)
    await page.locator('header nav a[href="#gallery"]').click()
    await page.locator('[data-gallery-section]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await expectNoAccessibilityViolations(page)
  })

  test('darkroom and Cinema Clean View have no accessibility violations', async ({
    page,
  }) => {
    await gotoShowroom(page)
    const { dialog } = await openPrismDarkroom(page)
    const caseStudy = page.locator(
      '[data-exhibit-case-study="prism-caustics"]',
    )
    await caseStudy.locator('summary').click()
    await expect(
      caseStudy.locator('[data-case-study-section="outcome"]'),
    ).toBeVisible()
    await expectNoAccessibilityViolations(page)

    await page.keyboard.press('h')
    await expect(dialog).toHaveAttribute(
      'data-darkroom-clean-view',
      'true',
    )
    await expectNoAccessibilityViolations(page)
  })
})
