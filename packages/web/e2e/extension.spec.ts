// The Chrome extension (packages/extension, built by `./td e2e`), loaded in Chromium: its options
// (Tandem's address), its popup on a web page (Tandem not running, bookmarks off, a new
// bookmark with the page's description and favicon, then "Already in Tandem"), and the ✓ on its
// toolbar button.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, test as base, type BrowserContext, type Worker } from '@playwright/test'
import { api } from './helpers'

/** What the tests call in the extension's service worker. */
declare const chrome: {
  tabs: { query(filter: { url: string }): Promise<{ id?: number }[]> }
  action: { getBadgeText(details: { tabId?: number }): Promise<string> }
}

const EXTENSION = join(import.meta.dirname, '..', '..', 'extension', 'dist')
const EXTENSION_ID = 'kmecpgdldjmbehndpobipnndopjdgkci'
/** The test server (playwright.config.ts) and the website, a web page to bookmark. */
const TANDEM = 'http://localhost:3020'
const PAGE = 'http://localhost:3021/'

const test = base.extend<{ context: BrowserContext; worker: Worker }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright's fixtures destructure their first argument
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext(
      mkdtempSync(join(tmpdir(), 'tandem-extension-')),
      {
        // Chromium's new headless mode runs extensions.
        channel: 'chromium',
        args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
      },
    )
    await use(context)
    await context.close()
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    await use(worker)
  },
})

test.afterEach(async ({ request }) => {
  await api(request, 'PATCH', '/settings', { bookmarks: false })
})

test('bookmarks the page from its popup, and says when Tandem can’t take it', async ({
  context,
  worker,
  request,
}) => {
  expect(worker.url()).toContain(EXTENSION_ID)

  // Options: an address where nothing answers.
  const options = await context.newPage()
  await options.goto(`chrome-extension://${EXTENSION_ID}/options.html`)
  await options.getByLabel('Tandem’s address').fill('localhost:3999')
  await options.getByRole('button', { name: 'Save' }).click()
  await expect(options.locator('#status')).toContainText('isn’t running at http://localhost:3999')

  const page = await context.newPage()
  await page.goto(PAGE)
  // Its title is set once the site's app has started: the popup reads the tab's.
  await page.waitForLoadState('networkidle')
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({ url: `${url}*` }))[0]?.id,
    PAGE,
  )
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${EXTENSION_ID}/popup.html?tab=${tabId}`)
  await expect(popup.locator('#problem')).toContainText('Tandem isn’t running')

  // The test server's address: bookmarks are off.
  await options.getByLabel('Tandem’s address').fill(TANDEM)
  await options.getByRole('button', { name: 'Save' }).click()
  await expect(options.locator('#status')).toContainText('bookmarks are off')
  await popup.reload()
  await expect(popup.locator('#problem')).toContainText('Bookmarks are off in Tandem')

  // On: the page's title and description, at the top (no folder to pick: the app sorts).
  await api(request, 'PATCH', '/settings', { bookmarks: true })
  await popup.getByRole('button', { name: 'Try again' }).click()
  await expect(popup.locator('#url')).toHaveValue(PAGE)
  const title = await page.title()
  await expect(popup.locator('#title')).toHaveValue(title)
  const description = await page
    .locator('meta[name="description"]')
    .getAttribute('content')
    .catch(() => null)
  if (description) await expect(popup.locator('#description')).toHaveValue(description)
  await expect(popup.locator('#folder')).toHaveCount(0)
  // The description is as tall as its text.
  const field = popup.locator('#description')
  await field.fill('One line')
  const short = (await field.boundingBox())!.height
  await field.fill(Array.from({ length: 6 }, (_, i) => `Line ${i + 1}`).join('\n'))
  expect((await field.boundingBox())!.height).toBeGreaterThan(short + 40)
  await field.fill(description ?? '')
  // Create closes the popup at once (a page opened by a test stays); the service worker saves.
  await popup.getByRole('button', { name: 'Create' }).click()

  interface Saved {
    id: string
    kind: string
    title: string
    url: string
    icon: string | null
    parentId: string | null
  }
  await expect
    .poll(async () =>
      (await api<Saved[]>(request, 'GET', '/bookmarks')).find((b) => b.url === PAGE),
    )
    .toMatchObject({ title, parentId: null })
  const bookmark = (await api<Saved[]>(request, 'GET', '/bookmarks')).find((b) => b.url === PAGE)

  // The toolbar button shows it's saved; the popup now edits it.
  await expect
    .poll(() => worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId))
    .toBe('✓')
  const again = await context.newPage()
  await again.goto(`chrome-extension://${EXTENSION_ID}/popup.html?tab=${tabId}`)
  await expect(again.locator('#heading')).toHaveText('Already in Tandem')
  await expect(again.locator('#existing')).toContainText('In Bookmarks')
  await again.locator('#title').fill('Renamed from Chrome')
  await again.getByRole('button', { name: 'Save' }).click()
  await expect
    .poll(async () => (await api<Saved>(request, 'GET', `/bookmarks/${bookmark!.id}`)).title)
    .toBe('Renamed from Chrome')

  // Cleaned up for the other tests.
  await api(request, 'DELETE', `/bookmarks/${bookmark!.id}`)
})

test('says when a page can’t be bookmarked', async ({ context }) => {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${EXTENSION_ID}/popup.html`)
  // Its own tab is the active one: not a web page.
  await expect(popup.locator('#problem')).toContainText('can’t be bookmarked')
})
