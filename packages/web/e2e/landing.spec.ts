// The landing page (/landing): full width, live demos, and a way into the app.
import { expect, test } from '@playwright/test'

test('shows the landing page without the app sidebar, and leads into the app', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/landing')
  await expect(page).toHaveTitle('Myfluence — notes you write with your agents')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('with your agents')
  await expect(page.getByLabel('Title')).toHaveCount(0)
  await expect(page.getByTestId('workspace-name')).toHaveCount(0)

  // The hero note writes itself.
  await expect(page.getByText('Ship the beta to ten friendly teams')).toBeVisible()

  // Sections reveal as they scroll in.
  const agents = page.getByRole('heading', { name: 'Give your agents a pen, not just a peek.' })
  await agents.scrollIntoViewIfNeeded()
  await expect(agents).toBeVisible()
  await expect(page.getByText('myfluence search "launch plan"')).toBeVisible()

  await page.getByRole('link', { name: 'Open the app' }).first().click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('workspace-name')).toBeVisible()
  expect(errors).toEqual([])
})

test('shows every demo in its final state with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/landing')
  await expect(page.getByText('Budget and hiring in')).toBeVisible()
  await expect(page.getByText('Showing results for')).toBeVisible()
})
