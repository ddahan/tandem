// Bookmarks: in the sidebar below the pages (folded until opened), a click shows one's
// information, cards in notes (/bookmark, or dragged from the sidebar), found by ⌘⇧F, and
// deleted once confirmed, their cards with them.
import { readFile } from 'node:fs/promises'
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

test('lists bookmarks right after the pages, folded until opened, and opens one as a page', async ({
  page,
  request,
}) => {
  const folder = await addBookmark(request, { kind: 'folder', title: 'Reading' })
  const article = await addBookmark(request, {
    url: 'https://example.com/article',
    title: 'An article',
    description: 'Worth a read',
    parentId: folder.id,
  })
  await page.goto('/')
  const section = page.getByTestId('bookmarks')
  await expect(section).toBeVisible()
  await expect(section.getByTestId('bookmark-Reading')).toBeHidden()
  // Right after the pages, not at the bottom of the sidebar.
  const pages = await page.getByTestId('tree-menu-area').boundingBox()
  const bookmarks = await section.boundingBox()
  expect(bookmarks!.y - (pages!.y + pages!.height)).toBeLessThan(40)

  // A folder opens as a page, with what it holds.
  await section.getByTestId('bookmarks-toggle').click()
  await section.getByTestId('bookmark-Reading').click()
  await expect(page).toHaveURL(`/bookmarks/${folder.id}`)
  const view = page.getByTestId('bookmark-page')
  await expect(view.getByTestId('bookmark-page-contents')).toContainText('An article')

  // A bookmark too, its fields edited in place.
  await section.getByTestId('bookmark-An article').click()
  await expect(page).toHaveURL(`/bookmarks/${article.id}`)
  await expect(view.getByTestId('bookmark-page-url')).toHaveValue('https://example.com/article')
  await expect(view).toContainText('Reading')
  await expect(view).toContainText('No page shows it yet')
  await view.getByTestId('bookmark-page-title').fill('An article, renamed')
  await view.getByTestId('bookmark-page-title').press('Enter')
  await view.getByTestId('bookmark-page-description').fill('Read it twice')
  await view.getByTestId('bookmark-page-description').blur()
  await expect
    .poll(async () =>
      api<Bookmark & { description: string }>(request, 'GET', `/bookmarks/${article.id}`),
    )
    .toMatchObject({ title: 'An article, renamed', description: 'Read it twice' })
  await expect(page.getByTestId('tab-An article, renamed')).toBeVisible()

  // An address already saved is refused, and the field goes back.
  await addBookmark(request, { url: 'https://example.com/other', title: 'Other' })
  await view.getByTestId('bookmark-page-url').fill('https://example.com/other')
  await view.getByTestId('bookmark-page-url').press('Enter')
  await expect(page.getByText('Already bookmarked as “Other”', { exact: true })).toBeVisible()
  await expect(view.getByTestId('bookmark-page-url')).toHaveValue('https://example.com/article')

  // Moved to the top from its folder field.
  await view.getByTestId('bookmark-page-folder').click()
  await page.getByRole('option', { name: 'Bookmarks' }).click()
  await expect
    .poll(async () => (await api<Bookmark>(request, 'GET', `/bookmarks/${article.id}`)).parentId)
    .toBeNull()

  // Deleted from its page: its tab goes.
  await page.getByRole('button', { name: 'Delete bookmark' }).click()
  await page.getByTestId('bookmark-delete-confirm').click()
  await expect(page.getByTestId('tab-An article, renamed')).toHaveCount(0)

  // Opened, the section stays open; off, it goes.
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

  // The same page again: it says so, and shows that one.
  await section.getByRole('button', { name: 'New bookmark or folder' }).click()
  await page.getByRole('menuitem', { name: 'New bookmark' }).click()
  await page.getByTestId('bookmark-url').fill('https://tools.example.com/')
  await page.getByTestId('bookmark-title').fill('Again')
  await page.getByTestId('bookmark-save').click()
  await expect(page.getByTestId('bookmark-duplicate')).toContainText('Example tools')
  await page.getByRole('button', { name: 'Show it' }).click()
  await expect(page).toHaveURL(/\/bookmarks\//)
  await expect(page.getByTestId('bookmark-page-title')).toHaveValue('Example tools')
})

test('right-clicking the section offers what + does, and exports for Chrome', async ({
  page,
  request,
}) => {
  const folder = await addBookmark(request, { kind: 'folder', title: 'Reading' })
  await addBookmark(request, {
    url: 'https://example.com/article',
    title: 'An article',
    parentId: folder.id,
  })
  await page.goto('/')
  const section = page.getByTestId('bookmarks')
  // Folded, on its title: a new folder, renamed in place (the section opens).
  await section.getByTestId('bookmarks-toggle').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'New bookmark' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'New folder' }).click()
  await page.getByLabel('New name').fill('Tools')
  await page.getByLabel('New name').press('Enter')
  await expect(section.getByTestId('bookmark-Tools')).toBeVisible()

  // Everything, as a file Chrome imports.
  await section.getByTestId('bookmarks-toggle').click({ button: 'right' })
  const all = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export all for Chrome' }).click()
  const file = await all
  expect(file.suggestedFilename()).toMatch(/^tandem-bookmarks-\d{4}-\d{2}-\d{2}\.html$/)
  const html = await readFile((await file.path())!, 'utf8')
  expect(html).toMatch(/^<!DOCTYPE NETSCAPE-Bookmark-file-1>/)
  expect(html).toContain('>Tools</H3>')
  expect(html).toContain('<A HREF="https://example.com/article"')

  // A folder: from its menu, that folder alone.
  await expect(page.getByRole('menu')).toBeHidden()
  await section.getByTestId('bookmark-Reading').click({ button: 'right' })
  const one = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export for Chrome' }).click()
  const only = await readFile((await (await one).path())!, 'utf8')
  expect(only).toContain('>Reading</H3>')
  expect(only).not.toContain('Tools')

  // The section takes the sidebar's room left: a right click at its very bottom works too.
  await expect(page.getByRole('menu')).toBeHidden()
  const scroller = (await section.locator('..').boundingBox())!
  const box = (await section.boundingBox())!
  expect(box.y + box.height).toBeCloseTo(scroller.y + scroller.height, 0)
  await section.click({ button: 'right', position: { x: 40, y: box.height - 5 } })
  await expect(page.getByRole('menuitem', { name: 'New folder' })).toBeVisible()
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

  // A click selects it and opens its menu; ⌫ deletes it, ⌘Z brings it back, as any block.
  await card.getByText('Example documentation').click()
  await expect(card).toHaveClass(/is-selected/)
  await expect(page.getByRole('menuitem', { name: 'Open website' })).toBeVisible()
  await page.keyboard.press('Backspace')
  await expect(page.getByTestId('bookmark-card')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('bookmark-card')).toHaveCount(1)
  // Removed from its menu: undone the same way.
  await page.getByTestId('bookmark-card').getByText('Example documentation').click()
  await page.getByRole('menuitem', { name: 'Remove from the note' }).click()
  await expect(page.getByTestId('bookmark-card')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('bookmark-card')).toHaveCount(1)

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

  // An empty folder: nothing to lose, gone without asking.
  await addBookmark(request, { kind: 'folder', title: 'Empty' })
  await section.getByTestId('bookmark-Empty').click()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await expect(section.getByTestId('bookmark-Empty')).toBeHidden()
  await expect(page.getByTestId('bookmark-delete-confirm')).toHaveCount(0)
})
