import {
  expect,
  type Locator,
  type Page,
} from '@playwright/test'

const DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function trackRuntimeErrors(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  return {
    async assertClean() {
      await page.waitForTimeout(80)
      expect(pageErrors, 'Unhandled page errors').toEqual([])
      expect(consoleErrors, 'Browser console errors').toEqual([])
    },
  }
}

export async function gotoShowroom(page: Page) {
  const response = await page.goto('/')
  expect(response?.ok(), 'Showroom response').toBe(true)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('h1')).toBeVisible()
}

export async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))

  expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1)
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1)
}

export async function openPrismDarkroom(page: Page) {
  const galleryLink = page.locator(
    'header nav a[href="#gallery"]',
  )
  if (await galleryLink.isVisible()) {
    await galleryLink.click()
  } else {
    await page.evaluate(() => {
      document.getElementById('gallery')?.scrollIntoView()
    })
  }
  await page.locator('[data-gallery-section]').scrollIntoViewIfNeeded()
  const trigger = page.locator(
    '[data-enter-darkroom="prism-caustics"]',
  )
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()

  const dialog = page.locator('[data-darkroom-inspector]')
  await expect(dialog).toBeVisible()
  await expect(
    page.locator('[data-gallery-shared-canvas]'),
  ).toHaveAttribute('data-gallery-view-count', '1', {
    timeout: 15_000,
  })
  await expect(
    page.getByRole('button', {
      name: 'Close optical darkroom',
    }),
  ).toBeFocused()

  return { dialog, trigger }
}

export async function focusDialogBoundary(
  dialog: Locator,
  boundary: 'first' | 'last',
) {
  await dialog.evaluate(
    (element, { selector, target }) => {
      const focusable = Array.from(
        element.querySelectorAll<HTMLElement>(selector),
      ).filter((candidate) => {
        const style = window.getComputedStyle(candidate)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          candidate.getClientRects().length > 0
        )
      })
      const targetElement =
        target === 'first' ? focusable[0] : focusable.at(-1)
      targetElement?.focus()
    },
    {
      selector: DIALOG_FOCUSABLE_SELECTOR,
      target: boundary,
    },
  )
}
