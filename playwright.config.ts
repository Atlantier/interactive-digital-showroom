import { defineConfig, devices } from '@playwright/test'

const configuredChannel = process.env.PLAYWRIGHT_CHANNEL
const chromiumChannel =
  configuredChannel === 'bundled'
    ? undefined
    : configuredChannel ?? (process.env.CI ? undefined : 'chrome')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 7_500,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        channel: chromiumChannel,
        launchOptions: {
          args: [
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--use-angle=swiftshader',
          ],
        },
      },
    },
    {
      name: 'webkit',
      testMatch: /cross-browser\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Safari'],
      },
    },
    {
      name: 'firefox',
      testMatch: /cross-browser\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
      },
    },
  ],
})
