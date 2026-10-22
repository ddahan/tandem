// Bookmarks: in the sidebar below the pages (folded until opened), a click shows one's
// information, cards in notes (/bookmark, or dragged from the sidebar), found by ⌘⇧F, and
// deleted once confirmed, their cards with them.
import { expect, test, type APIRequestContext } from '@playwright/test'
import { api, createNote, noteContent, openNote, waitSaved, focusEnd } from './helpers'

interface Bookmark {
  id: string
  title: string
  url: string
  parentId: string | null
}

function addBookmark(request: APIRequestContext, fields: Record<string, unknown>) {
  return api<Bookmark>(request, 'POST', '/bookmarks', fields)
}

test.beforeEach(async ({ request }) => {
  await api(request, 'PATCH', '/settings', { bookmarks: true })
  for (const bookmark of await api<Bookmark[]>(request, 'GET', '/bookmarks')) {
    if (!bookmark.parentId) await api(request, 'DELETE', `/bookmarks/${bookmark.id}`)
  }
})

test.afterEach(async ({ request }) => {
  await api(request, 'PATCH', '/settings', { bookmarks: false })
})

test('lists bookmarks below the pages, folded until opened, and shows one’s information', async ({
  page,
  request,
}) => {
  const folder = await addBookmark(request, { kind: 'folder', title: 'Reading' })
  await addBookmark(request, {
    url: 'https://example.com/article',
    title: 'An article',
    description: 'Worth a read',
    parentId: folder.id,
  })
  await page.goto('/')
  const section = page.getByTestId('bookmarks')
  await expect(section).toBeVisible()
  await expect(section.getByTestId('bookmark-Reading')).toBeHidden()
  await section.getByTestId('bookmarks-toggle').click()
  await section.getByTestId('bookmark-Reading').click()
  await section.getByTestId('bookmark-An article').click()
  const info = page.getByTestId('bookmark-info')
  await expect(info).toContainText('https://example.com/article')
  await expect(info).toContainText('Worth a read')
  await expect(info).toContainText('Reading')
  await expect(info).toContainText('No page shows it.')

  // Opened, it stays open; off, the section goes.
  await page.reload()
  await expect(section.getByTestId('bookmark-Reading')).toBeVisible()
  await api(request, 'PATCH', '/settings', { bookmarks: false })
  await expect(section).toBeHidden()
})

test('makes a bookmark from the sidebar, and a folder, renamed in place', async ({ page }) => {
  await page.goto('/')
  const section = page.getByTestId('bookmarks')
  await section.getByRole('button', { name: 'New bookmark or folder' }).click()
  await page.getByRole('menuitem', { name: 'New folder' }).click()
  await page.getByLabel('New name').fill('Tools')
  await page.getByLabel('New name').press('Enter')
  await expect(section.getByTestId('bookmark-Tools')).toBeVisible()

  await section.getByRole('button', { name: 'New bookmark or folder' }).click()
  await page.getByRole('menuitem', { name: 'New bookmark' }).click()
  // No web in the tests: the page can't be read, the name is typed.
  await page.getByTestId('bookmark-url').fill('tools.example.com')
  await page.getByTestId('bookmark-title').fill('Example tools')
  await page.getByTestId('bookmark-description').fill('Handy')
  await page.getByTestId('bookmark-folder').click()
  await page.getByRole('option', { name: 'Tools' }).click()
  await page.getByTestId('bookmark-save').click()
  await section.getByTestId('bookmark-Tools').click()
  await expect(section.getByTestId('bookmark-Example tools')).toBeVisible()

  // The same page again: it says so, and offers to edit that one.
  await section.getByRole('button', { name: 'New bookmark or folder' }).click()
  await page.getByRole('menuitem', { name: 'New bookmark' }).click()
  await page.getByTestId('bookmark-url').fill('https://tools.example.com/')
  await page.getByTestId('bookmark-title').fill('Again')
  await page.getByTestId('bookmark-save').click()
  await expect(page.getByTestId('bookmark-duplicate')).toContainText('Example tools')
  await page.getByRole('button', { name: 'Edit it' }).click()
  await expect(page.getByTestId('bookmark-title')).toHaveValue('Example tools')
  await page.getByTestId('bookmark-title').fill('Example tools, renamed')
  await page.getByTestId('bookmark-save').click()
  await expect(section.getByTestId('bookmark-Example tools, renamed')).toBeVisible()
})

test('shows a bookmark’s card in a note, from / and from the sidebar, found by ⌘⇧F', async ({
  page,
  request,
}) => {
  const docs = await addBookmark(request, {
    url: 'https://docs.example.com',
    title: 'Example docs',
    description: 'The reference',
  })
  const blog = await addBookmark(request, {
    url: 'https://blog.example.com',
    title: 'Example blog',
  })
  const note = await createNote(request, 'Links', 'Useful:')
  await openNote(page, note.id)
  await focusEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('/bookmark')
  await expect(page.getByText('A website’s card, from your bookmarks')).toBeVisible()
  await page.keyboard.press('Enter')
  const picker = page.getByTestId('bookmark-picker')
  await picker.getByPlaceholder('Find a bookmark, or paste an address…').fill('refer')
  // The search's results (the latest bookmarks show until then).
  await expect(picker.getByRole('option')).toHaveCount(1)
  await expect(picker.getByRole('option', { name: /Example docs/ })).toBeVisible()
  await page.keyboard.press('Enter')
  const card = page.getByTestId('bookmark-card')
  await expect(card).toContainText('Example docs')
  await expect(card).toContainText('docs.example.com')
  await expect(card).toContainText('The reference')
  await waitSaved(page)
  expect(await noteContent(request, note.id)).toContain(`\`\`\`bookmark\nid: ${docs.id}\n\`\`\``)

  // Changing the bookmark changes its card.
  await api(request, 'PATCH', `/bookmarks/${docs.id}`, { title: 'Example documentation' })
  await expect(card).toContainText('Example documentation')

  // Dragged from the sidebar, a bookmark becomes a card.
  const section = page.getByTestId('bookmarks')
  await section.getByTestId('bookmarks-toggle').click()
  await section.getByTestId('bookmark-Example blog').dragTo(page.locator('.ProseMirror p').first())
  await expect(page.getByTestId('bookmark-card')).toHaveCount(2)
  await waitSaved(page)
  expect(await noteContent(request, note.id)).toContain(`id: ${blog.id}`)

  // ⌘⇧F finds bookmarks, by their description too.
  await page.keyboard.press('ControlOrMeta+Shift+F')
  await page.getByPlaceholder(/^Search notes/).fill('reference')
  await expect(page.getByRole('option', { name: /Example documentation/ })).toBeVisible()
})

test('deletes a bookmark once confirmed, naming the pages that show it, and its cards go', async ({
  page,
  request,
}) => {
  const bookmark = await addBookmark(request, { url: 'https://gone.example.com', title: 'Gone' })
  const note = await createNote(
    request,
    'Shows it',
    `Before\n\n\`\`\`bookmark\nid: ${bookmark.id}\n\`\`\`\n\nAfter\n`,
  )
  await openNote(page, note.id)
  await expect(page.getByTestId('bookmark-card')).toContainText('Gone')
  const section = page.getByTestId('bookmarks')
  await section.getByTestId('bookmarks-toggle').click()
  await section.getByTestId('bookmark-Gone').click()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await expect(page.getByTestId('bookmark-delete-pages')).toContainText('Shows it')
  await page.getByTestId('bookmark-delete-confirm').click()
  await expect(section.getByTestId('bookmark-Gone')).toBeHidden()
  // The open note shows it at once, and its file no longer has it.
  await expect(page.getByTestId('bookmark-card')).toHaveCount(0)
  expect(await noteContent(request, note.id)).toBe('Before\n\nAfter\n')
})
