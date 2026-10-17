// Installing Myfluence as an app: the sidebar banner and Settings, driven by the browser's
// install prompt (sent by the test: Playwright's Chromium doesn't send one by itself).
import { expect, test, type Page } from '@playwright/test'

/** Sends `beforeinstallprompt`, as Chrome does when the app can be installed. */
async function offerInstall(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') {
  await page.evaluate((choice) => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt(): Promise<void>
      userChoice: Promise<{ outcome: string }>
    }
    event.prompt = async () => {
      ;(window as Window & { prompted?: boolean }).prompted = true
    }
    event.userChoice = Promise.resolve({ outcome: choice })
    window.dispatchEvent(event)
  }, outcome)
}

test('offers to install the app when the browser can, with its icon', async ({ page }) => {
  await page.goto('/')
  const banner = page.getByTestId('install-banner')
  await expect(banner).toHaveCount(0)

  await offerInstall(page)
  await expect(banner).toBeVisible()
  await expect(banner.locator('svg')).toBeVisible()
  await banner.getByRole('button', { name: 'Install' }).click()
  expect(await page.evaluate(() => (window as Window & { prompted?: boolean }).prompted)).toBe(true)
  // The prompt is used: nothing left to offer.
  await expect(banner).toHaveCount(0)
})

test('hides the banner for good once closed; Settings still offers to install', async ({
  page,
}) => {
  await page.goto('/')
  await offerInstall(page, 'dismissed')
  await page
    .getByTestId('install-banner')
    .getByRole('button', { name: "Don't offer again" })
    .click()
  await expect(page.getByTestId('install-banner')).toHaveCount(0)

  await page.reload()
  await offerInstall(page, 'dismissed')
  await expect(page.getByTestId('workspace-name')).toBeVisible()
  await expect(page.getByTestId('install-banner')).toHaveCount(0)

  await page.getByRole('link', { name: 'Settings', exact: true }).first().click()
  await page.getByRole('button', { name: 'Install Myfluence' }).click()
  expect(await page.evaluate(() => (window as Window & { prompted?: boolean }).prompted)).toBe(true)
  await expect(page.getByTestId('install-settings')).toContainText("isn't offering")
})
