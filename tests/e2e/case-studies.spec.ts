import { expect, test } from '@playwright/test'
import {
  expectNoHorizontalOverflow,
  gotoShowroom,
  openPrismDarkroom,
  trackRuntimeErrors,
} from './helpers'

test('opens a complete technical case file', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const errors = trackRuntimeErrors(page)
  await gotoShowroom(page)
  await openPrismDarkroom(page)

  const caseStudy = page.locator(
    '[data-exhibit-case-study="prism-caustics"]',
  )
  await expect(caseStudy).toBeVisible()
  await caseStudy.locator('summary').click()
  await expect(caseStudy).toHaveAttribute('open', '')

  for (const section of [
    'objective',
    'system',
    'challenge',
    'outcome',
    'metrics',
    'stack',
  ]) {
    await expect(
      caseStudy.locator(
        `[data-case-study-section="${section}"]`,
      ),
    ).toBeVisible()
  }

  await expect(
    caseStudy.locator(
      '[data-case-study-section="metrics"] > div > div',
    ),
  ).toHaveCount(3)
  await expect(
    caseStudy.locator(
      '[data-case-study-section="stack"] > div > span',
    ),
  ).toHaveCount(4)

  await errors.assertClean()
})

test('keeps the case file readable on mobile', async ({ page }) => {
  test.setTimeout(90_000)
  const errors = trackRuntimeErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoShowroom(page)
  await openPrismDarkroom(page)

  const caseStudy = page.locator(
    '[data-exhibit-case-study="prism-caustics"]',
  )
  await caseStudy.scrollIntoViewIfNeeded()
  await caseStudy.locator('summary').click()
  await expect(
    caseStudy.locator('[data-case-study-section="objective"]'),
  ).toBeVisible()
  await expect(
    caseStudy.locator('[data-case-study-section="outcome"]'),
  ).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await errors.assertClean()
})
