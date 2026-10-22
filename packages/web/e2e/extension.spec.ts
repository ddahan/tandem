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

  // On: the page's title and description, in a new folder.
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
  await popup.locator('#folder').selectOption('+new')
  await popup.locator('#new-folder-name').fill('From Chrome')
  await popup.locator('#new-folder-name').press('Enter')
  await expect(popup.locator('#folder option:checked')).toHaveText('From Chrome')
  await popup.getByRole('button', { name: 'Create' }).click()
  await expect(popup.locator('#saved')).toContainText('is in From Chrome')

  interface Saved {
    id: string
    kind: string
    title: string
    url: string
    icon: string | null
    parentId: string | null
  }
  const saved = await api<Saved[]>(request, 'GET', '/bookmarks')
  const folder = saved.find((b) => b.kind === 'folder' && b.title === 'From Chrome')
  const bookmark = saved.find((b) => b.url === PAGE)
  expect(bookmark).toMatchObject({ title, parentId: folder?.id })

  // The toolbar button shows it's saved; the popup now edits it.
  await expect
    .poll(() => worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId))
    .toBe('✓')
  await popup.goto(`chrome-extension://${EXTENSION_ID}/popup.html?tab=${tabId}`)
  await expect(popup.locator('#heading')).toHaveText('Already in Tandem')
  await expect(popup.locator('#existing')).toContainText('In From Chrome')
  await popup.locator('#title').fill('Renamed from Chrome')
  await popup.getByRole('button', { name: 'Save' }).click()
  await expect(popup.locator('#saved')).toBeVisible()
  expect((await api<Saved>(request, 'GET', `/bookmarks/${bookmark!.id}`)).title).toBe(
    'Renamed from Chrome',
  )

  // Cleaned up for the other tests.
  await api(request, 'DELETE', `/bookmarks/${folder!.id}`)
})

test('says when a page can’t be bookmarked', async ({ context }) => {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${EXTENSION_ID}/popup.html`)
  // Its own tab is the active one: not a web page.
  await expect(popup.locator('#problem')).toContainText('can’t be bookmarked')
})
