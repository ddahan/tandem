// The website (site/, tandem.w3lt.org): the landing page alone, built with TANDEM_SITE=1 and
// served as Caddy does (playwright.config.ts), with no Tandem server behind it.
import { expect, test } from '@playwright/test'

test.use({ baseURL: 'http://localhost:3021' })

test('shows the landing page, leading to the install command and GitHub', async ({ page }) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))
  await page.goto('/')
  await expect(page).toHaveTitle('Tandem — notes you write with your agents')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('with your agents')
  await expect(page.getByLabel('Title')).toHaveCount(0)
  await expect(page.getByTestId('workspace-name')).toHaveCount(0)

  // The one-line install, early, with its copy button.
  const install = page.getByTestId('install-command').first()
  await expect(install).toBeVisible()
  await expect(install).toContainText(
    'main.tar.gz | tar -xz -C /tmp && sh /tmp/tandem-main/app/install.sh',
  )
  await expect(install.getByRole('button', { name: 'Copy the install command' })).toBeVisible()

  // The hero note writes itself.
  await expect(page.getByText('Ship the beta to ten friendly teams')).toBeVisible()

  // Sections reveal as they scroll in.
  const agents = page.getByRole('heading', { name: 'Give your agents a pen, not just a peek.' })
  await agents.scrollIntoViewIfNeeded()
  await expect(agents).toBeVisible()
  await expect(page.getByText('tandem search "launch plan"')).toBeVisible()

  // No app behind it: links go to the install command and GitHub.
  await expect(page.getByRole('link', { name: 'Open the app' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tandem on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/ddahan/tandem',
  )
  await page.getByRole('link', { name: 'Install', exact: true }).first().click()
  await expect(page).toHaveURL(/#install$/)
  expect(errors).toEqual([])
  // Nothing asked of a Tandem server.
  expect(requests.filter((path) => path.startsWith('/api'))).toEqual([])
})

test('shows every demo in its final state with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByText('Budget and hiring in')).toBeVisible()
  await expect(page.getByText('Showing results for')).toBeVisible()
})
