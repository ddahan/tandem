// Settings › Features: optional parts of the app, hidden when off, their data kept.
import { expect, test } from '@playwright/test'
import { api, createNote, openNote } from './helpers'

interface Settings {
  tags: boolean
  trash: boolean
  todos: boolean
  spellcheck: boolean
}

test.afterEach(async ({ request }) => {
  await api(request, 'PATCH', '/settings', {
    tags: false,
    trash: true,
    todos: false,
    homeRecent: true,
    shortcutHints: true,
    daily: false,
  })
})

test('starts with tags, TODOs and spell check off, the trash on', async ({ page, request }) => {
  const settings = await api<Settings>(request, 'GET', '/settings')
  expect(settings).toMatchObject({ tags: false, trash: true, todos: false, spellcheck: false })

  await page.goto('/settings/features')
  const features = page.getByTestId('features')
  await expect(features.getByRole('switch', { name: 'Tags' })).not.toBeChecked()
  await expect(features.getByRole('switch', { name: 'Trash' })).toBeChecked()
  await expect(features.getByRole('switch', { name: 'TODOs' })).not.toBeChecked()
  await expect(features.getByRole('switch', { name: 'Spell check' })).not.toBeChecked()
  await expect(page.getByRole('link', { name: 'Trash', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^TODOs/ })).toHaveCount(0)
})

test('hides tags while off, and shows them as they were once back on', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Kept tags', 'Text.')
  await api(request, 'PUT', `/notes/${note.id}/tags`, { tags: ['kept-tag'] })
  await openNote(page, note.id)
  await expect(page.getByPlaceholder('Add tag…')).toHaveCount(0)
  await expect(page.getByText('kept-tag')).toHaveCount(0)

  await page.goto('/settings/features')
  await page.getByTestId('features').getByRole('switch', { name: 'Tags' }).click()
  await expect.poll(async () => (await api<Settings>(request, 'GET', '/settings')).tags).toBe(true)
  await openNote(page, note.id)
  await expect(page.getByPlaceholder('Add tag…')).toBeVisible()
  await expect(page.getByText('kept-tag')).toBeVisible()
})

test('highlights TODOs only when on, without changing the note', async ({ page, request }) => {
  const note = await createNote(request, 'Quiet todo', 'TODO: later.\n')
  await openNote(page, note.id)
  const highlight = page.locator('.ProseMirror .todo-highlight').first()
  await expect(highlight).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  await api(request, 'PATCH', '/settings', { todos: true })
  await page.reload()
  await expect(highlight).toHaveCSS('background-color', /rgba\(253, 224, 71/)
  await expect(page.getByRole('link', { name: /^TODOs/ })).toBeVisible()
  // Other tests count the TODOs.
  await api(request, 'DELETE', `/nodes/${note.id}`)
})

test('with the trash off, deleting asks, then deletes forever', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { trash: false })
  const note = await createNote(request, 'Gone for good', 'Bye.')
  const other = await createNote(request, 'Also gone', 'Bye.')
  await openNote(page, note.id)
  await expect(page.getByRole('link', { name: 'Trash', exact: true })).toHaveCount(0)

  // From the tree (⌘⌫): asked first; cancelled, nothing happens.
  const row = page.getByTestId('tree-Also gone')
  await row.focus()
  await page.keyboard.press('ControlOrMeta+Backspace')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Delete “Also gone” forever?')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(row).toBeVisible()
  await row.focus()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await dialog.getByRole('button', { name: 'Delete forever' }).click()
  await expect(row).toHaveCount(0)

  // From the note's menu.
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await dialog.getByRole('button', { name: 'Delete forever' }).click()
  await expect(page.getByTestId('tree-Gone for good')).toHaveCount(0)

  // Nothing to lose (no text, pages, files or history): gone without asking, from the tree…
  const blank = await createNote(request, 'Blank', '')
  const blankRow = page.getByTestId('tree-Blank')
  await blankRow.focus()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await expect(blankRow).toHaveCount(0)
  await expect(dialog).toHaveCount(0)
  expect((await request.get(`/api/notes/${blank.id}`)).status()).toBe(404)
  // …and from its own menu.
  const another = await createNote(request, 'Blank too', '')
  await openNote(page, another.id)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page.getByTestId('tree-Blank too')).toHaveCount(0)
  await expect(dialog).toHaveCount(0)

  const trash = await api<{ title: string }[]>(request, 'GET', '/trash')
  expect(trash.map((item) => item.title)).not.toContain('Gone for good')
  expect(trash.map((item) => item.title)).not.toContain('Also gone')
  expect((await request.get(`/api/notes/${other.id}`)).status()).toBe(404)
})

test('shows Home’s recently updated pages, unless General says not to', async ({
  page,
  request,
}) => {
  await createNote(request, 'Recent on Home', 'Text.')
  await page.goto('/')
  await expect(page.getByTestId('home-recent')).toContainText('Recent on Home')

  await page.goto('/settings/general')
  await page.getByRole('switch', { name: 'Recently updated pages on Home' }).click()
  await expect
    .poll(async () => (await api<{ homeRecent: boolean }>(request, 'GET', '/settings')).homeRecent)
    .toBe(false)
  // Home, from the logo (opening / brings the last tab back).
  await page.getByTestId('workspace-name').click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('home-recent')).toHaveCount(0)
})

test('shows shortcuts’ keys, unless Appearance says not to; Docs always do', async ({
  page,
  request,
}) => {
  await api(request, 'PATCH', '/settings', { daily: true })
  // The installed app's window (headless Chrome can't emulate display-mode): there, ⌘T is
  // Tandem's, and Today shows it.
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      if (!query.includes('display-mode: standalone')) return original(query)
      return {
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList
    }
  })
  await page.goto('/settings/appearance')
  const search = page.getByRole('button', { name: /Search/ }).first()
  const today = page.getByRole('navigation', { name: 'Calendar notes' })
  await expect(search.locator('kbd').first()).toBeVisible()
  await expect(today.locator('kbd')).toHaveCount(2)
  // In the app's window, the calendar shows the keys that browse days and weeks.
  await today.getByText('Today').click()
  // One shortcut: ⌥⌘ and any arrow (⌃⌥ works too, not shown).
  await expect(page.getByTestId('calendar-keys')).toContainText('Navigate days and weeks')
  await expect(page.getByTestId('calendar-keys').getByLabel('Any arrow key')).toHaveCount(1)
  // Docs › Shortcuts shows the app's keys too.
  await page.goto('/docs/shortcuts')
  await expect(page.getByTestId('shortcuts-browser')).toHaveCount(0)
  await expect(page.getByTestId('shortcut').filter({ hasText: 'Close the tab' })).toHaveCount(1)
  await page.goto('/settings/appearance')

  await page.getByRole('switch', { name: 'Keyboard shortcuts' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-shortcut-hints', 'off')
  await expect(search.locator('kbd').first()).toBeHidden()
  await expect(today.locator('kbd').first()).toBeHidden()
  await page.goto('/docs/shortcuts')
  await expect(page.getByTestId('shortcut').first().locator('kbd').first()).toBeVisible()
})
