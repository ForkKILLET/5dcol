import { expect, test } from '@playwright/test'

test('loads the first actionable screen', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', error => pageErrors.push(error))

  await page.goto('/')

  const gameCanvas = page.locator('.game > canvas')
  await expect(page.locator('.game')).toBeVisible()
  await expect(gameCanvas).toBeVisible()
  await expect(page.locator('.language-button')).toBeVisible()

  const loadingDialog = page.locator('.loading-backdrop')
  const mainMenu = page.locator('.main-menu')
  await loadingDialog.or(mainMenu).first().waitFor({ state: 'visible' })

  if (await loadingDialog.isVisible()) {
    const enterGameButton = loadingDialog.getByRole('button')
    await expect(enterGameButton).toBeVisible({ timeout: 30_000 })
    await enterGameButton.click()
  }

  await expect(mainMenu).toBeVisible()

  const canvasSize = await gameCanvas.evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }))
  expect(canvasSize.width).toBeGreaterThan(0)
  expect(canvasSize.height).toBeGreaterThan(0)
  expect(pageErrors).toEqual([])
})
