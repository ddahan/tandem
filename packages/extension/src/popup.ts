// The popup ("Add to Tandem"): the current page as a bookmark, its name, address and
// description filled from the tab, in the last folder used. A page already in Tandem is edited
// instead (as Chrome's star does). Tandem not running, or bookmarks off, says so plainly.
import type { Bookmark } from '@tandem/shared'
import { bookmarkable, faviconDataUrl, pageDescription } from './page.ts'
import { getAddress, getLastFolder, setLastFolder } from './settings.ts'
import { createTandem, folderOptions, folderPath, TandemError, type Tandem } from './tandem.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const NEW_FOLDER = '+new'
/** The top of the bookmarks, in the folder picker. */
const TOP = ''

let tandem: Tandem
let tab: chrome.tabs.Tab
let existing: Bookmark | null = null
let bookmarks: Bookmark[] = []
let iconDataUrl: string | undefined

function show(section: 'loading' | 'problem' | 'form' | 'saved') {
  for (const id of ['loading', 'problem', 'form', 'saved']) $(id).hidden = id !== section
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

function fillFolders(selected: string | null) {
  const select = $<HTMLSelectElement>('folder')
  const options = folderOptions(bookmarks).map((folder) => {
    const option = document.createElement('option')
    option.value = folder.id ?? TOP
    option.textContent = `${' '.repeat(Math.max(0, folder.depth - 1))}${folder.label}`
    return option
  })
  const add = document.createElement('option')
  add.value = NEW_FOLDER
  add.textContent = 'New folder…'
  select.replaceChildren(...options, add)
  select.value = selected && bookmarks.some((b) => b.id === selected) ? selected : TOP
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
  fillFolders(bookmark.parentId)
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
    const [all, found, description, icon, lastFolder] = await Promise.all([
      tandem.list(),
      tandem.lookup(url),
      pageDescription(current.id),
      faviconDataUrl(url, current.favIconUrl),
      getLastFolder(),
    ])
    bookmarks = all
    iconDataUrl = icon
    if (found) useExisting(found)
    else {
      $<HTMLInputElement>('title').value = current.title?.trim() || url
      $<HTMLInputElement>('url').value = url
      $<HTMLTextAreaElement>('description').value = description
      fillFolders(lastFolder)
    }
    show('form')
    const title = $<HTMLInputElement>('title')
    title.focus()
    title.select()
  } catch (error) {
    failed(error)
  }
}

async function addFolder() {
  const name = $<HTMLInputElement>('new-folder-name').value.trim()
  if (!name) return
  try {
    const folder = await tandem.createFolder(name, null)
    bookmarks = [...bookmarks, folder]
    fillFolders(folder.id)
    $('new-folder').hidden = true
    $<HTMLInputElement>('new-folder-name').value = ''
  } catch (error) {
    formError(error)
  }
}

function formError(error: unknown) {
  if (error instanceof TandemError && error.problem !== 'error') return failed(error)
  const element = $('form-error')
  element.textContent = error instanceof Error ? error.message : String(error)
  element.hidden = false
}

async function save(event: Event) {
  event.preventDefault()
  const saveButton = $<HTMLButtonElement>('save')
  saveButton.disabled = true
  $('form-error').hidden = true
  const folder = $<HTMLSelectElement>('folder').value
  const parentId = folder === TOP || folder === NEW_FOLDER ? null : folder
  const fields = {
    title: $<HTMLInputElement>('title').value,
    url: $<HTMLInputElement>('url').value,
    description: $<HTMLTextAreaElement>('description').value,
    parentId,
  }
  try {
    const result = existing
      ? await tandem.update(existing.id, fields)
      : await tandem.create({ ...fields, iconDataUrl })
    if (result.duplicate && !existing) {
      // Saved meanwhile (another window): edit that one.
      useExisting(result.bookmark)
      saveButton.disabled = false
      return
    }
    await setLastFolder(parentId)
    $('saved-text').textContent =
      `“${result.bookmark.title}” is in ${folderPath(bookmarks, result.bookmark)}.`
    show('saved')
    void chrome.runtime.sendMessage({ type: 'bookmarked', tabId: tab.id }).catch(() => {})
    setTimeout(() => window.close(), 900)
  } catch (error) {
    formError(error)
  } finally {
    saveButton.disabled = false
  }
}

$('form').addEventListener('submit', (event) => void save(event))
$('cancel').addEventListener('click', () => window.close())
// ⌘↵ (Ctrl+↵) saves from the description too, where ↵ is a new line.
$('description').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
    $<HTMLFormElement>('form').requestSubmit()
})
$('folder').addEventListener('change', () => {
  const adding = $<HTMLSelectElement>('folder').value === NEW_FOLDER
  $('new-folder').hidden = !adding
  if (adding) $('new-folder-name').focus()
})
$('new-folder-add').addEventListener('click', () => void addFolder())
$('new-folder-name').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  event.preventDefault()
  void addFolder()
})

void start()
