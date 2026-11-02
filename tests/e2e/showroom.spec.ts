import { expect, test } from '@playwright/test'
import {
  expectNoHorizontalOverflow,
  focusDialogBoundary,
  gotoShowroom,
  openPrismDarkroom,
  trackRuntimeErrors,
} from './helpers'

test('loads the showroom without overflow at desktop and mobile widths', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page)

  await gotoShowroom(page)
  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  for (const viewport of [
    { height: 844, width: 390 },
    { height: 568, width: 320 },
  ]) {
    await page.setViewportSize(viewport)
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }

  await errors.assertClean()
})

test('keeps the gallery at zero canvases until the darkroom opens', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page)
  await gotoShowroom(page)

  await page.locator('header nav a[href="#gallery"]').click()
  await page.locator('[data-gallery-section]').scrollIntoViewIfNeeded()
  const sharedCanvas = page.locator(
    '[data-gallery-shared-canvas]',
  )

  await expect(sharedCanvas).toHaveAttribute(
    'data-gallery-stage-mounted',
    'false',
  )
  await expect(sharedCanvas).toHaveAttribute(
    'data-gallery-view-count',
    '0',
  )
  await expect(sharedCanvas.locator('canvas')).toHaveCount(0)

  await openPrismDarkroom(page)
  await expect(sharedCanvas.locator('canvas')).toHaveCount(1)
  await expect(sharedCanvas).toHaveAttribute(
    'data-gallery-view-count',
    '1',
  )

  await page.keyboard.press('Escape')
  await expect(
    page.locator('[data-darkroom-inspector]'),
  ).toHaveCount(0)
  await expect(sharedCanvas.locator('canvas')).toHaveCount(0)
  await expect(sharedCanvas).toHaveAttribute(
    'data-gallery-stage-mounted',
    'false',
  )
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe('')

  await errors.assertClean()
})

test('traps focus and resolves layered Escape targets in order', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page)
  await gotoShowroom(page)
  const { dialog } = await openPrismDarkroom(page)

  await expect
    .poll(() =>
      page.evaluate(
        () => document.getElementById('root')?.inert ?? false,
      ),
    )
    .toBe(true)

  await focusDialogBoundary(dialog, 'last')
  await page.keyboard.press('Tab')
  await expect
    .poll(() =>
      dialog.evaluate(
        (element) => element.contains(document.activeElement),
      ),
    )
    .toBe(true)

  await focusDialogBoundary(dialog, 'first')
  await page.keyboard.press('Shift+Tab')
  await expect
    .poll(() =>
      dialog.evaluate(
        (element) => element.contains(document.activeElement),
      ),
    )
    .toBe(true)

  await page
    .getByRole('button', { name: 'Close optical darkroom' })
    .focus()
  await page.keyboard.press('h')
  await expect(dialog).toHaveAttribute(
    'data-darkroom-clean-view',
    'true',
  )
  await expect(
    page.getByRole('button', {
      name: /Exit cinema clean view/,
    }),
  ).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveAttribute(
    'data-darkroom-clean-view',
    'false',
  )
  await expect(
    page.getByRole('button', { name: 'Close optical darkroom' }),
  ).toBeFocused()

  await page.keyboard.press('Control+k')
  const palette = page.locator('[data-command-palette]')
  await expect(palette).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Search commands' }),
  ).toBeFocused()
  await expect(dialog).toHaveAttribute('aria-hidden', 'true')
  await expect
    .poll(() =>
      dialog.evaluate(
        (element) => (element as HTMLElement).inert,
      ),
    )
    .toBe(true)

  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(dialog).not.toHaveAttribute('aria-hidden', 'true')
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe('hidden')

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(
    page.locator('[data-enter-darkroom="prism-caustics"]'),
  ).toBeFocused()
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe('')

  await errors.assertClean()
})

test('returns focus after closing the command palette', async ({ page }) => {
  const errors = trackRuntimeErrors(page)
  await gotoShowroom(page)

  const openButton = page.getByRole('button', {
    name: 'Open command palette',
  })
  await openButton.focus()
  await page.keyboard.press('Control+k')

  const palette = page.locator('[data-command-palette]')
  await expect(palette).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Search commands' }),
  ).toBeFocused()
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getElementById('root')?.inert ?? false,
      ),
    )
    .toBe(true)

  await focusDialogBoundary(palette, 'last')
  await page.keyboard.press('Tab')
  await expect
    .poll(() =>
      palette.evaluate(
        (element) => element.contains(document.activeElement),
      ),
    )
    .toBe(true)

  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
  await expect(openButton).toBeFocused()
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getElementById('root')?.inert ?? true,
      ),
    )
    .toBe(false)

  await errors.assertClean()
})

test('keeps Bento geometry stable while scrolling', async ({ page }) => {
  const errors = trackRuntimeErrors(page)
  await gotoShowroom(page)

  const bento = page.locator('[data-bento-grid]')
  const heightBefore = await bento.evaluate(
    (element) => element.getBoundingClientRect().height,
  )

  let previousScroll = await page.evaluate(() => window.scrollY)
  for (let index = 0; index < 18; index += 1) {
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(24)
    const currentScroll = await page.evaluate(() => window.scrollY)
    expect(currentScroll).toBeGreaterThanOrEqual(previousScroll - 2)
    previousScroll = currentScroll
  }

  const heightAfter = await bento.evaluate(
    (element) => element.getBoundingClientRect().height,
  )
  expect(Math.abs(heightAfter - heightBefore)).toBeLessThan(0.5)
  await errors.assertClean()
})

test('switches locale without creating horizontal overflow', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page)
  await gotoShowroom(page)

  await page.locator('[data-language-option="zh"]').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expectNoHorizontalOverflow(page)

  await page.locator('[data-language-option="en"]').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expectNoHorizontalOverflow(page)
  await errors.assertClean()
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('settles locale motion and disables looping decorative animation', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page)
    await gotoShowroom(page)

    await expect(
      page.locator('[data-localized-text-root]'),
    ).toHaveAttribute(
      'data-locale-motion',
      'settled',
    )
    await expect
      .poll(() =>
        page.locator('.bento-comet').first().evaluate(
          (element) => window.getComputedStyle(element).animationName,
        ),
      )
      .toBe('none')

    await page.locator('header nav a[href="#gallery"]').click()
    await page.locator('[data-gallery-section]').scrollIntoViewIfNeeded()
    const scanline = page
      .locator(
        '[data-preview-running="true"] .exhibit-preview-scanline',
      )
      .first()
    await expect(scanline).toBeVisible()
    const motion = await scanline.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        duration: Number.parseFloat(style.animationDuration),
        iterations: style.animationIterationCount,
      }
    })
    expect(motion.duration).toBeLessThan(0.1)
    expect(motion.iterations).toBe('1')

    await errors.assertClean()
  })
})
