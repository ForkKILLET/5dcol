import { expect, test } from '@playwright/test'

test('flips the game view without stopping the render loop', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', error => pageErrors.push(error))

  await page.goto('/?renderer=canvas')

  const loadingDialog = page.locator('.loading-backdrop')
  if (await loadingDialog.isVisible()) {
    const enterGameButton = loadingDialog.getByRole('button')
    await expect(enterGameButton).toBeVisible({ timeout: 30_000 })
    await enterGameButton.click()
  }

  await page.getByRole('button', { name: 'Versus' }).click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.locator('.versus-create-panel').getByRole('button', { name: 'Create' }).click()

  const flipViewButton = page.getByRole('button', { name: 'Flip view' })
  await flipViewButton.click()
  await page.waitForTimeout(500)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('5dcol.viewPlayer'))).toBe('black')

  await page.reload()
  if (await loadingDialog.isVisible()) {
    const enterGameButton = loadingDialog.getByRole('button')
    await expect(enterGameButton).toBeVisible({ timeout: 30_000 })
    await enterGameButton.click()
  }
  await page.getByRole('button', { name: 'Versus' }).click()
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(flipViewButton).toBeVisible()
  await page.waitForTimeout(500)

  for (let i = 0; i < 8; i++) {
    await flipViewButton.click()
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(500)

  await expect(flipViewButton).toBeVisible()
  expect(pageErrors).toEqual([])
})
