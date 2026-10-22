// The extension's service worker: a ✓ on the toolbar button when the page is already in Tandem
// (checked when the tab changes), the popup's saves (made here, so that the popup closes at
// once: the ✓ shows meanwhile, a ! if it fails), and Tandem's bookmarks in the address bar (the
// keyword `tb`, then Tab and words). Tandem not running, or bookmarks off: no ✓, and the address
// bar says so.
import { siteOf } from '@tandem/shared'
import { bookmarkable } from './page.ts'
import { getAddress } from './settings.ts'
import { createTandem, TandemError, type SaveMessage } from './tandem.ts'

const BADGE_COLOR = '#f59e0b'
const ERROR_COLOR = '#dc2626'

async function tandem() {
  return createTandem(await getAddress())
}

/** Tabs whose page is being saved: a look-up meanwhile (the popup closing) would miss it. */
const saving = new Set<number>()

/** Shows whether the tab's page is bookmarked (nothing when it can't be known). */
async function refreshBadge(tabId: number, url: string | undefined) {
  if (saving.has(tabId)) return
  const page = bookmarkable(url)
  let saved = false
  if (page) {
    try {
      saved = !!(await (await tandem()).lookup(page))
    } catch {
      // Not running, or bookmarks off: no ✓.
    }
  }
  if (saving.has(tabId)) return
  await badge(tabId, saved ? '✓' : '', saved ? 'Already in Tandem' : 'Add to Tandem')
}

async function badge(tabId: number, text: string, title: string, color = BADGE_COLOR) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {})
  await chrome.action.setBadgeText({ tabId, text }).catch(() => {})
  await chrome.action.setTitle({ tabId, title }).catch(() => {})
}

/** The popup's save: shown as done at once; a failure turns the ✓ into a ! that says why. */
async function save({ tabId, id, fields }: SaveMessage) {
  saving.add(tabId)
  await badge(tabId, '✓', 'Already in Tandem')
  try {
    const client = await tandem()
    // A duplicate (saved meanwhile, elsewhere) is saved all the same.
    await (id ? client.update(id, fields) : client.create(fields))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await badge(tabId, '!', `Couldn’t save in Tandem: ${reason}`, ERROR_COLOR)
  } finally {
    saving.delete(tabId)
  }
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

chrome.runtime.onMessage.addListener((message: SaveMessage, _sender, respond) => {
  if (message.type !== 'save') return
  // Received: the popup can close; the save goes on here.
  respond({ received: true })
  void save(message)
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
