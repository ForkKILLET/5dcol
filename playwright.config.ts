/// <reference types="@types/node" />

import { existsSync } from 'node:fs'
import { dirname, join, parse, resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

function findWorkspaceRoot(startDirectory: string): string {
  let directory = resolve(startDirectory)
  const filesystemRoot = parse(directory).root

  while (directory !== filesystemRoot) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) return directory
    directory = dirname(directory)
  }

  return resolve(startDirectory)
}

const workspaceRoot = findWorkspaceRoot(process.cwd())
const envPath = join(workspaceRoot, '.env')
loadEnv({ path: envPath, quiet: true })

const systemChromePath = '/run/current-system/sw/bin/google-chrome'
const chromeExecutablePath = process.env.PLAYWRIGHT_CHROME_PATH
  ?? (existsSync(systemChromePath) ? systemChromePath : undefined)

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5160',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    launchOptions: chromeExecutablePath
      ? { executablePath: chromeExecutablePath }
      : {},
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
})
