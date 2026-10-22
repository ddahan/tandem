// The extension's service worker: a ✓ on the toolbar button when the page is already in Tandem
// (checked when the tab changes, or once the popup saved it), and Tandem's bookmarks in the
// address bar (the keyword `tb`, then Tab and words). Tandem not running, or bookmarks off: no
// ✓, and the address bar says so.
import { siteOf } from '@tandem/shared'
import { bookmarkable } from './page.ts'
import { getAddress } from './settings.ts'
import { createTandem, TandemError } from './tandem.ts'

const BADGE_COLOR = '#f59e0b'

async function tandem() {
  return createTandem(await getAddress())
}

/** Shows whether the tab's page is bookmarked (nothing when it can't be known). */
async function refreshBadge(tabId: number, url: string | undefined) {
  const page = bookmarkable(url)
  let saved = false
  if (page) {
    try {
      saved = !!(await (await tandem()).lookup(page))
    } catch {
      // Not running, or bookmarks off: no ✓.
    }
  }
  await chrome.action.setBadgeText({ tabId, text: saved ? '✓' : '' }).catch(() => {})
  await chrome.action
    .setTitle({ tabId, title: saved ? 'Already in Tandem' : 'Add to Tandem' })
    .catch(() => {})
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR })
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => refreshBadge(tabId, tab.url))
})

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === 'complete') void refreshBadge(tabId, tab.url)
})

chrome.runtime.onMessage.addListener((message: { type?: string; tabId?: number }) => {
  if (message.type !== 'bookmarked' || !message.tabId) return
  const tabId = message.tabId
  void chrome.tabs.get(tabId).then((tab) => refreshBadge(tabId, tab.url))
})

// --- The address bar ---------------------------------------------------------------------------

/** Text for the address bar's suggestions, which read XML (`<match>`, `<url>`, `<dim>`). */
function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** A search result's title, its matches (`<mark>` from Tandem) as the address bar's. */
function matched(titleHtml: string): string {
  return titleHtml.replace(/<mark>/g, '<match>').replace(/<\/mark>/g, '</match>')
}

chrome.omnibox.setDefaultSuggestion({ description: 'Search your bookmarks in Tandem' })

let typed = 0
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const request = ++typed
  void (async () => {
    try {
      const results = await (await tandem()).search(text, 6)
      if (request !== typed) return
      chrome.omnibox.setDefaultSuggestion({
        description: results.length
          ? `Search your bookmarks in Tandem: <match>${xml(text)}</match>`
          : `No bookmark matches <match>${xml(text)}</match> in Tandem`,
      })
      suggest(
        results.map(({ bookmark, titleHtml, folders }) => ({
          content: bookmark.url,
          description: `${matched(titleHtml)} <dim>—</dim> <url>${xml(siteOf(bookmark.url))}</url>${folders ? ` <dim>${xml(folders)}</dim>` : ''}`,
        })),
      )
    } catch (error) {
      chrome.omnibox.setDefaultSuggestion({
        description: xml(
          error instanceof TandemError && error.problem === 'off'
            ? 'Bookmarks are off in Tandem (Settings › Features)'
            : error instanceof Error
              ? error.message
              : 'Tandem can’t be reached',
        ),
      })
      suggest([])
    }
  })()
})

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  void (async () => {
    // A suggestion is its bookmark's address; typed words open the best match.
    let url = bookmarkable(text)
    if (!url || !/^https?:\/\//i.test(text)) {
      const [best] = await (await tandem()).search(text, 1).catch(() => [])
      url = best?.bookmark.url ?? null
    }
    if (!url) return
    if (disposition === 'currentTab') await chrome.tabs.update({ url })
    else await chrome.tabs.create({ url, active: disposition === 'newForegroundTab' })
  })()
})
