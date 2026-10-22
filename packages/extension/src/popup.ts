// The popup ("Add to Tandem"): the current page as a bookmark, its name, address and
// description filled from the tab. New bookmarks go to the top: they're sorted in the app. A
// page already in Tandem is edited instead (as Chrome's star does). Tandem not running, or
// bookmarks off, says so plainly. Saving is the service worker's (background.ts): the popup
// closes at once.
import type { Bookmark } from '@tandem/shared'
import { bookmarkable, faviconDataUrl, pageDescription } from './page.ts'
import { getAddress } from './settings.ts'
import { createTandem, folderPath, TandemError, type SaveMessage, type Tandem } from './tandem.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

let tandem: Tandem
let tab: chrome.tabs.Tab
let existing: Bookmark | null = null
let bookmarks: Bookmark[] = []
let iconDataUrl: string | undefined

function show(section: 'loading' | 'problem' | 'form') {
  for (const id of ['loading', 'problem', 'form']) $(id).hidden = id !== section
}

function button(label: string, onClick: () => void, primary = false) {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = label
  if (primary) element.className = 'primary'
  element.addEventListener('click', onClick)
  return element
}

function problem(title: string, text: string, actions: HTMLButtonElement[] = []) {
  $('problem-title').textContent = title
  $('problem-text').textContent = text
  $('problem-actions').replaceChildren(...actions)
  show('problem')
}

function failed(error: unknown) {
  const retry = button('Try again', () => void start(), true)
  if (error instanceof TandemError && error.problem === 'offline') {
    problem(
      'Tandem isn’t running',
      `Nothing answers at ${tandem.address}. Tandem starts with your computer: if it doesn’t, run its install command again. If it uses another address, change it in the extension’s options.`,
      [button('Options', () => void chrome.runtime.openOptionsPage()), retry],
    )
  } else if (error instanceof TandemError && error.problem === 'off') {
    problem(
      'Bookmarks are off in Tandem',
      'Turn them on in Tandem’s Settings › Features, then try again.',
      [
        button('Open Settings', () => {
          void chrome.tabs.create({ url: `${tandem.address}/settings/features` })
          window.close()
        }),
        retry,
      ],
    )
  } else {
    problem('Couldn’t reach Tandem', error instanceof Error ? error.message : String(error), [
      retry,
    ])
  }
}

function useExisting(bookmark: Bookmark) {
  existing = bookmark
  $('heading').textContent = 'Already in Tandem'
  const notice = $('existing')
  notice.textContent = `In ${folderPath(bookmarks, bookmark)}. Saving changes it.`
  notice.hidden = false
  $<HTMLInputElement>('title').value = bookmark.title
  $<HTMLInputElement>('url').value = bookmark.url
  $<HTMLTextAreaElement>('description').value = bookmark.description
  $('save').textContent = 'Save'
}

/** The tab to bookmark: the active one, or `?tab=<id>` (the popup opened as a page, in tests). */
async function targetTab(): Promise<chrome.tabs.Tab | undefined> {
  const id = Number(new URLSearchParams(location.search).get('tab'))
  if (id) return chrome.tabs.get(id)
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  return active
}

async function start() {
  show('loading')
  tandem = createTandem(await getAddress())
  const current = await targetTab()
  const url = bookmarkable(current?.url)
  if (!current?.id || !url) {
    problem(
      'This page can’t be bookmarked',
      'Only web pages (http and https addresses) go to Tandem.',
    )
    return
  }
  tab = current
  try {
    if (!(await tandem.enabled())) throw new TandemError('off', 'Bookmarks are off in Tandem.')
    const [all, found, description, icon] = await Promise.all([
      tandem.list(),
      tandem.lookup(url),
      pageDescription(current.id),
      faviconDataUrl(url, current.favIconUrl),
    ])
    bookmarks = all
    iconDataUrl = icon
    if (found) useExisting(found)
    else {
      $<HTMLInputElement>('title').value = current.title?.trim() || url
      $<HTMLInputElement>('url').value = url
      $<HTMLTextAreaElement>('description').value = description
    }
    show('form')
    const title = $<HTMLInputElement>('title')
    title.focus()
    title.select()
  } catch (error) {
    failed(error)
  }
}

async function save(event: Event) {
  event.preventDefault()
  const message: SaveMessage = {
    type: 'save',
    tabId: tab.id!,
    id: existing?.id,
    fields: {
      title: $<HTMLInputElement>('title').value,
      url: $<HTMLInputElement>('url').value,
      description: $<HTMLTextAreaElement>('description').value,
      ...(existing ? {} : { iconDataUrl }),
    },
  }
  // Received (not saved yet) once it answers: closing earlier could lose it.
  await chrome.runtime.sendMessage(message).catch(() => {})
  window.close()
}

$('form').addEventListener('submit', (event) => void save(event))
$('cancel').addEventListener('click', () => window.close())
// ⌘↵ (Ctrl+↵) saves from the description too, where ↵ is a new line.
$('description').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
    $<HTMLFormElement>('form').requestSubmit()
})

void start()
