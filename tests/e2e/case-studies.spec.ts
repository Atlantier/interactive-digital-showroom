import { expect, test } from '@playwright/test'
import {
  expectNoHorizontalOverflow,
  gotoShowroom,
  openPrismDarkroom,
  trackRuntimeErrors,
} from './helpers'

const EXHIBITS = [
  'prism-caustics',
  'laser-scan-hologram',
  'particle-morph',
  'plasma-reactor',
  'photonic-mesh',
  'orbital-lens',
  'quantum-lattice',
  'phase-torus',
] as const

test('opens a complete technical case file for all eight exhibits', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors = trackRuntimeErrors(page)
  await gotoShowroom(page)
  await openPrismDarkroom(page)

  const activeStage = page.locator('[data-darkroom-active-exhibit]')

  for (let index = 0; index < EXHIBITS.length; index += 1) {
    const exhibitId = EXHIBITS[index]
    if (index > 0) {
      await page
        .locator(`[data-gallery-quick-item="${index}"]`)
        .click()
      await expect(activeStage).toHaveAttribute(
        'data-darkroom-active-exhibit',
        exhibitId,
      )
    }

    const caseStudy = page.locator(
      `[data-exhibit-case-study="${exhibitId}"]`,
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
  }

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
