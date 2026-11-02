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

test('defers below-fold modules until their sections approach the viewport', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page)
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await gotoShowroom(page)

  await expect(
    page.locator('[data-deferred-section="gallery"]'),
  ).toHaveAttribute('data-deferred-ready', 'false')
  await expect(
    page.locator('[data-deferred-section="architecture"]'),
  ).toHaveAttribute('data-deferred-ready', 'false')
  await expect(
    page.locator('[data-deferred-section="sandbox"]'),
  ).toHaveAttribute('data-deferred-ready', 'false')
  await expect(
    page.locator('[data-gallery-section]'),
  ).toHaveCount(0)
  await expect(
    page.locator('[data-gallery-shared-canvas]'),
  ).toHaveCount(0)

  expect(
    requests.some((url) =>
      /(?:DarkroomInspectorModal|ScrollArchitecture3D|VerletLanyard|FabrikCreature|BentoGrid)\.tsx/.test(
        url,
      ),
    ),
  ).toBe(false)

  await page
    .locator('#architecture')
    .scrollIntoViewIfNeeded()
  await expect(
    page.locator('[data-deferred-section="architecture"]'),
  ).toHaveAttribute('data-deferred-ready', 'true')
  await expect(
    page.locator(
      '[data-deferred-section="architecture"] [data-architecture-section]',
    ),
  ).toHaveCount(1)

  await page.locator('#gallery').scrollIntoViewIfNeeded()
  await expect(
    page.locator('[data-gallery-section]'),
  ).toBeVisible()
  await expect(
    page.locator('[data-gallery-shared-canvas]'),
  ).toHaveCount(1)

  await errors.assertClean()
})

test('keeps the gallery at zero canvases until the darkroom opens', async ({
  page,
}) => {
  test.setTimeout(90_000)
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

test.describe('mobile gallery controls', () => {
  test('uses safe-area-aware collapsible Dock with 44px targets', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page)

    for (const viewport of [
      { height: 568, width: 320 },
      { height: 844, width: 390 },
      { height: 932, width: 430 },
    ]) {
      await page.setViewportSize(viewport)
      await gotoShowroom(page)
      await page.evaluate(() => {
        document.getElementById('gallery')?.scrollIntoView()
      })

      const dock = page.locator('[data-gallery-quick-dock]')
      await expect(dock).toBeVisible()
      await expect(dock).toHaveAttribute(
        'data-gallery-quick-expanded',
        'false',
      )
      await expectNoHorizontalOverflow(page)

      const toggle = dock.locator('[data-gallery-quick-toggle]')
      await toggle.click()
      await expect(dock).toHaveAttribute(
        'data-gallery-quick-expanded',
        'true',
      )

      const items = dock.locator('[data-gallery-quick-item]')
      await expect(items).toHaveCount(8)
      for (let index = 0; index < 8; index += 1) {
        const box = await items.nth(index).boundingBox()
        expect(box).not.toBeNull()
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      }

      const dockBox = await dock.boundingBox()
      expect(dockBox).not.toBeNull()
      expect((dockBox?.y ?? 0) + (dockBox?.height ?? 0)).toBeLessThanOrEqual(
        viewport.height,
      )
    }

    await errors.assertClean()
  })

  test('reserves space below darkroom controls for the collapsed Dock', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoShowroom(page)
    await openPrismDarkroom(page)

    const dock = page.locator('[data-gallery-quick-dock]')
    const toggle = dock.locator('[data-gallery-quick-toggle]')
    await toggle.click()
    await dock
      .locator('[data-gallery-quick-item="5"]')
      .click()
    await toggle.click()
    const pads = page.locator('[data-audio-stage-pads]')
    await pads.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)

    const dockBox = await dock.boundingBox()
    const padsBox = await pads.boundingBox()
    expect(dockBox).not.toBeNull()
    expect(padsBox).not.toBeNull()
    expect((padsBox?.y ?? 0) + (padsBox?.height ?? 0)).toBeLessThanOrEqual(
      (dockBox?.y ?? 0) + 2,
    )

    await errors.assertClean()
  })
})

test('traps focus and resolves layered Escape targets in order', async ({
  page,
}) => {
  test.setTimeout(90_000)
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

test('shares one frame scheduler and pauses it while the document is hidden', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await gotoShowroom(page)

  await expect
    .poll(async () =>
      Number(
        await page
          .locator('html')
          .getAttribute('data-frame-subscribers'),
      ),
    )
    .toBeGreaterThanOrEqual(3)
  await expect(page.locator('html')).toHaveAttribute(
    'data-frame-active',
    'true',
  )

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('html')).toHaveAttribute(
    'data-frame-active',
    'false',
  )

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('html')).toHaveAttribute(
    'data-frame-active',
    'true',
  )

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

  await page
    .locator('[data-deferred-section="content"]')
    .first()
    .scrollIntoViewIfNeeded()
  const bento = page.locator('[data-bento-grid]')
  await expect(bento).toBeVisible()
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

    const sceneCanvas = page.locator('[data-scene-canvas]')
    await expect(sceneCanvas).toHaveAttribute(
      'data-reduced-motion',
      'true',
    )
    await expect(sceneCanvas).toHaveAttribute(
      'data-postprocessing',
      'bloom-vignette',
    )
    await expect(sceneCanvas).toHaveAttribute(
      'data-shader-pass-count',
      '2',
    )
    await expect(
      page.locator('[data-localized-text-root]'),
    ).toHaveAttribute(
      'data-locale-motion',
      'settled',
    )
    await page
      .locator('[data-deferred-section="content"]')
      .first()
      .scrollIntoViewIfNeeded()
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

    const gallery = page.locator('[data-gallery-section]')
    await expect(gallery).toHaveAttribute(
      'data-gallery-motion-mode',
      'reduced',
    )
    await expect(gallery).toHaveAttribute(
      'data-gallery-effective-timescale-value',
      '0.12',
    )

    const tourToggle = page.locator('[data-gallery-tour-toggle]')
    await tourToggle.click()
    await expect(gallery).toHaveAttribute(
      'data-gallery-tour-active',
      'true',
    )
    await expect(gallery).toHaveAttribute(
      'data-gallery-tour-paused',
      'true',
    )
    await tourToggle.click()
    await expect(gallery).toHaveAttribute(
      'data-gallery-tour-paused',
      'false',
    )
    await tourToggle.click()
    await expect(gallery).toHaveAttribute(
      'data-gallery-tour-paused',
      'true',
    )

    const trigger = page.locator(
      '[data-enter-darkroom="prism-caustics"]',
    )
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    await expect(
      page.locator('[data-darkroom-inspector]'),
    ).toBeVisible()
    const sharedCanvas = page.locator(
      '[data-gallery-shared-canvas]',
    )
    await expect(sharedCanvas).toHaveAttribute(
      'data-gallery-view-count',
      '1',
      { timeout: 15_000 },
    )
    await expect(sharedCanvas).toHaveAttribute(
      'data-reduced-motion',
      'true',
    )
    await expect(sharedCanvas).toHaveAttribute(
      'data-gallery-effective-timescale-value',
      '0.12',
    )
    await expect(
      page.locator('[data-darkroom-control]').first(),
    ).toBeVisible()

    await errors.assertClean()
  })
})
