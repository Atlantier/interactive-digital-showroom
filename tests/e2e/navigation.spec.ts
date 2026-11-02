import { expect, test } from '@playwright/test'
import { trackRuntimeErrors } from './helpers'

test('syncs section navigation with hash, query, and browser history', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page)
  const response = await page.goto('/?campaign=history-test', {
    waitUntil: 'networkidle',
  })
  expect(response?.ok(), 'Showroom response').toBe(true)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const worksLink = page.locator('header nav a[href="#works"]')
  const galleryLink = page.locator('header nav a[href="#gallery"]')

  await worksLink.click()
  await expect(page).toHaveURL(
    /\/\?campaign=history-test#works$/,
  )
  await expect(worksLink).toHaveAttribute('aria-current', 'location')

  await galleryLink.click()
  await expect(page).toHaveURL(
    /\/\?campaign=history-test#gallery$/,
  )
  await expect(page.locator('[data-gallery-section]')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(
    /\/\?campaign=history-test#works$/,
  )
  await expect(worksLink).toHaveAttribute('aria-current', 'location')

  await page.goForward()
  await expect(page).toHaveURL(
    /\/\?campaign=history-test#gallery$/,
  )
  await expect(page.locator('[data-gallery-section]')).toBeVisible()

  const historyLength = await page.evaluate(() => history.length)
  await page.mouse.wheel(0, 420)
  await page.waitForTimeout(240)
  expect(await page.evaluate(() => history.length)).toBe(historyLength)

  await page
    .getByRole('link', {
      name: 'NODE/01 Personal Digital Showroom',
    })
    .click()
  await expect(page).toHaveURL(
    /\/\?campaign=history-test#home$/,
  )
  await expect(
    page.locator('header nav a[href="#home"]'),
  ).toHaveAttribute('aria-current', 'location')

  await page.keyboard.press('Control+k')
  const palette = page.locator('[data-command-palette]')
  await expect(palette).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Search commands' })
    .fill('Optics')
  await page.locator('[data-command-id="section-gallery"]').click()
  await expect(palette).toBeHidden()
  await expect(page).toHaveURL(
    /\/\?campaign=history-test#gallery$/,
  )

  await errors.assertClean()
})

test('restores deep-linked sections with the original query intact', async ({
  page,
}) => {
  const errors = trackRuntimeErrors(page)
  const response = await page.goto(
    '/?source=deep-link#architecture',
    { waitUntil: 'networkidle' },
  )
  expect(response?.ok(), 'Showroom response').toBe(true)
  await expect(page).toHaveURL(
    /\/\?source=deep-link#architecture$/,
  )
  await expect(
    page.locator('[data-deferred-section="architecture"]'),
  ).toHaveAttribute('data-deferred-ready', 'true', {
    timeout: 15_000,
  })
  await expect(
    page.locator('[data-architecture-section]'),
  ).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(500)
  await expect(
    page.locator('header nav a[href="#architecture"]'),
  ).toHaveAttribute('aria-current', 'location')

  await errors.assertClean()
})
