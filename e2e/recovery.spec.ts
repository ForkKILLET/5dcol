import { expect, test } from '@playwright/test'

const RECOVERABLE_KEYS = [
  '5dcol.lastRoom',
  '5dcol.panelLayout',
  '5dcol.settings',
  '5dcol.studyWorkspaces',
  '5dcol.viewPlayer',
] as const

test('safe mode bypasses interface state without deleting local studies', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('5dcol.lastRoom', JSON.stringify({
      kind: 'local-study',
      id: 'missing-study',
      updatedAt: 1,
    }))
    localStorage.setItem('5dcol.panelLayout', '{"broken":')
    localStorage.setItem('5dcol.settings', JSON.stringify({
      autoEnterLastRoom: true,
      renderer: 'webgl',
    }))
    localStorage.setItem('5dcol.studyWorkspaces', JSON.stringify({
      version: 1,
      workspaces: {
        'saved-workspace': {
          focusedBoard: { l: 0, m: 1 },
        },
      },
    }))
    localStorage.setItem('5dcol.viewPlayer', 'black')
    localStorage.setItem('5dcol.localStudies', JSON.stringify({
      version: 1,
      studies: [],
    }))
  })

  await page.goto('/?safe=1')

  const recoveryDialog = page.getByRole('dialog', { name: 'Recovery mode' })
  await expect(recoveryDialog).toBeVisible()
  await recoveryDialog.getByRole('button', { name: 'Continue' }).click()

  const loadingDialog = page.locator('.loading-backdrop')
  if (await loadingDialog.isVisible()) {
    const enterGameButton = loadingDialog.getByRole('button')
    await expect(enterGameButton).toBeVisible({ timeout: 30_000 })
    await enterGameButton.click()
  }
  await expect(page.locator('.main-menu')).toBeVisible()

  const stored = await page.evaluate(keys => Object.fromEntries(
    keys.map(key => [key, localStorage.getItem(key)]),
  ), [...RECOVERABLE_KEYS, '5dcol.localStudies'])
  expect(stored['5dcol.viewPlayer']).toBe('black')
  expect(stored['5dcol.panelLayout']).toBe('{"broken":')
  expect(stored['5dcol.localStudies']).toBe(JSON.stringify({
    version: 1,
    studies: [],
  }))
})

test('interface reset preserves local study documents', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('5dcol.e2e.recoverySeeded')) return
    sessionStorage.setItem('5dcol.e2e.recoverySeeded', '1')
    for (const key of [
      '5dcol.lastRoom',
      '5dcol.panelLayout',
      '5dcol.settings',
      '5dcol.studyWorkspaces',
      '5dcol.viewPlayer',
    ]) localStorage.setItem(key, '"test-value"')
    localStorage.setItem('5dcol.localStudies', JSON.stringify({
      version: 1,
      studies: [],
    }))
  })

  await page.goto('/?safe=1')
  const recoveryDialog = page.getByRole('dialog', { name: 'Recovery mode' })
  await recoveryDialog.getByText('More recovery options').click()

  await Promise.all([
    page.waitForNavigation(),
    recoveryDialog.getByRole('button', { name: 'Reset interface state' }).click(),
  ])

  const stored = await page.evaluate(keys => Object.fromEntries(
    keys.map(key => [key, localStorage.getItem(key)]),
  ), [...RECOVERABLE_KEYS, '5dcol.localStudies'])
  for (const key of RECOVERABLE_KEYS) expect(stored[key]).toBeNull()
  expect(stored['5dcol.localStudies']).toBe(JSON.stringify({
    version: 1,
    studies: [],
  }))
})

test('repeated startup failures automatically activate safe mode', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('5dcol.recovery.crashState', JSON.stringify({
      version: 1,
      count: 2,
      lastFailure: {
        message: 'Injected startup failure',
        source: 'startup',
        timestamp: Date.now(),
      },
    }))
  })

  await page.goto('/')
  await expect(page.getByRole('dialog', { name: 'Recovery mode' })).toBeVisible()
  expect(new URL(page.url()).searchParams.has('safe')).toBe(false)
})

test('invalid individual settings fall back without deleting their raw value', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('5dcol.settings', '{"broken":')
  })

  await page.goto('/')
  const loadingDialog = page.locator('.loading-backdrop')
  if (await loadingDialog.isVisible()) {
    const enterGameButton = loadingDialog.getByRole('button')
    await expect(enterGameButton).toBeVisible({ timeout: 30_000 })
    await enterGameButton.click()
  }

  await expect(page.locator('.main-menu')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('5dcol.settings'))).toBe('{"broken":')
})

test('an uncaught browser error opens the recovery dialog', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', {
      error: new Error('Injected render failure'),
    }))
  })

  const recoveryDialog = page.getByRole('dialog', { name: 'Something went wrong' })
  await expect(recoveryDialog).toBeVisible()
  await expect(recoveryDialog).toContainText('Injected render failure')
})
