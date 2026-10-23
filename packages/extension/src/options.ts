// The extension's options: Tandem's address (the installer's is http://localhost:3864; Tandem
// takes another port when that one is taken), checked as it's saved; and importing Chrome's
// bookmarks (Chrome asks for the access first: the extension doesn't read them otherwise).
import { formatNumber } from '@tandem/shared'
import { countBookmarks, importSummary, toImportNodes, withIcons } from './import.ts'
import { faviconDataUrl } from './page.ts'
import { getAddress, setAddress } from './settings.ts'
import { createTandem, TandemError } from './tandem.ts'

const input = document.getElementById('address') as HTMLInputElement
const status = document.getElementById('status') as HTMLParagraphElement

async function check(address: string) {
  status.className = 'muted'
  status.textContent = 'Checking…'
  try {
    const enabled = await createTandem(address).enabled()
    status.className = enabled ? 'muted' : 'error'
    status.textContent = enabled
      ? `Tandem answers at ${address}.`
      : `Tandem answers at ${address}, but its bookmarks are off (Settings › Features).`
  } catch (error) {
    status.className = 'error'
    status.textContent =
      error instanceof TandemError ? error.message : `Tandem can’t be reached at ${address}.`
  }
}

document.getElementById('form')!.addEventListener('submit', (event) => {
  event.preventDefault()
  void setAddress(input.value).then((address) => {
    input.value = address
    return check(address)
  })
})

void getAddress().then((address) => {
  input.value = address
  return check(address)
})

const importButton = document.getElementById('import') as HTMLButtonElement
const importStatus = document.getElementById('import-status') as HTMLParagraphElement

function say(text: string, error = false) {
  importStatus.className = error ? 'error' : 'muted'
  importStatus.textContent = text
}

importButton.addEventListener('click', () => {
  // Asked for right away, while the click counts (Chrome only asks on one).
  const granted = chrome.permissions.request({ permissions: ['bookmarks'] })
  importButton.disabled = true
  void importBookmarks(granted).finally(() => (importButton.disabled = false))
})

async function importBookmarks(granted: Promise<boolean>) {
  try {
    if (!(await granted)) {
      say('Chrome’s bookmarks weren’t imported: the extension needs to read them.', true)
      return
    }
    const nodes = toImportNodes(await chrome.bookmarks.getTree())
    const total = countBookmarks(nodes)
    if (!total) {
      say('Chrome has no bookmarks to import.')
      return
    }
    // What Chrome gives for a page it has no icon of: left out (Tandem shows its own).
    const generic = await faviconDataUrl('https://tandem.invalid/', undefined)
    const withFavicons = await withIcons(
      nodes,
      (url) => faviconDataUrl(url, undefined),
      generic,
      (done) => say(`Reading icons… ${formatNumber(done)} / ${formatNumber(total)}`),
    )
    say(`Importing ${formatNumber(total)} bookmarks…`)
    const tandem = createTandem(await getAddress())
    const result = await tandem.importBookmarks(withFavicons)
    say(importSummary(result))
  } catch (error) {
    say(error instanceof TandemError ? error.message : 'The import failed.', true)
  }
}
