// Bookmarks: part of the notes. Unsorted in the sidebar (the inbox note's, right after the pages),
// a click shows one's page, cards in notes (/bookmark, a pasted address, or dragged from
// Unsorted: moved), "Used N times", the side panel's Bookmarks tab, found by ⌘⇧F, exported for
// Chrome, and deleted once confirmed, their cards with them.
import { readFile } from 'node:fs/promises'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { api, createNote, noteContent, openNote, waitSaved, focusEnd } from './helpers'

interface Bookmark {
  id: string
  title: string
  url: string
  uses: number
  emoji: string | null
}

interface Unsorted {
  noteId: string | null
  bookmarks: Bookmark[]
}

function addBookmark(request: APIRequestContext, fields: Record<string, unknown>) {
  return api<Bookmark>(request, 'POST', '/bookmarks', fields)
}

const block = (id: string) => `\`\`\`bookmark\nid: ${id}\n\`\`\``

async function openSidePanel(page: Page, tab: string) {
  const panel = page.locator('#tandem-panels-panel-note-side')
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'Toggle side panel' }).click()
  }
  await page.getByRole('tab', { name: tab }).click()
  return panel
}

test.beforeEach(async ({ request }) => {
  await api(request, 'PATCH', '/settings', { bookmarks: true })
  for (const bookmark of await api<Bookmark[]>(request, 'GET', '/bookmarks')) {
    await api(request, 'DELETE', `/bookmarks/${bookmark.id}`)
  }
})

test.afterEach(async ({ request }) => {
  await api(request, 'PATCH', '/settings', { bookmarks: false })
})

test('Unsorted lists the inbox note’s bookmarks right after the pages, and edits one in place', async ({
  page,
  request,
}) => {
  const article = await addBookmark(request, {
    url: 'https://example.com/article',
    title: 'An article',
    description: 'Worth a read',
    inbox: true,
  })
  await addBookmark(request, { url: 'https://example.com/later', title: 'Later', inbox: true })
  await page.goto('/')
  const section = page.getByTestId('unsorted')
  await expect(section).toBeVisible()
  // Right after the pages, not at the bottom of the sidebar; the latest first, counted.
  const pages = await page.getByTestId('tree-menu-area').boundingBox()
  const box = await section.boundingBox()
  expect(box!.y - (pages!.y + pages!.height)).toBeLessThan(40)
  await expect(section.getByTestId('unsorted-count')).toHaveText('2')
  await expect(section.locator('[data-unsorted-id]')).toHaveText(['Later', 'An article'])

  // A click edits it next to its row (no page of its own): its name, focused, saved with ↵.
  await section.getByTestId('unsorted-An article').click()
  const fields = page.getByTestId('bookmark-fields')
  await expect(fields.getByTestId('bookmark-url-field')).toHaveValue('https://example.com/article')
  await expect(fields.getByTestId('bookmark-pages')).toContainText('Bookmarks')
  await expect(fields.getByTestId('bookmark-title-field')).toBeFocused()
  await fields.getByTestId('bookmark-title-field').fill('An article, renamed')
  await fields.getByTestId('bookmark-title-field').press('Enter')
  await expect(fields).toHaveCount(0)
  await expect(page).toHaveURL('/')
  await section.getByTestId('unsorted-An article, renamed').click()
  await fields.getByTestId('bookmark-description-field').fill('Read it twice')
  await fields.getByTestId('bookmark-done').click()
  await expect
    .poll(async () =>
      api<Bookmark & { description: string }>(request, 'GET', `/bookmarks/${article.id}`),
    )
    .toMatchObject({ title: 'An article, renamed', description: 'Read it twice' })
  await expect(section.getByTestId('unsorted-An article, renamed')).toBeVisible()

  // Esc puts a field back as it was.
  await section.getByTestId('unsorted-An article, renamed').click()
  await fields.getByTestId('bookmark-title-field').fill('Not this')
  await fields.getByTestId('bookmark-title-field').press('Escape')
  await expect(fields).toHaveCount(0)
  await expect(section.getByTestId('unsorted-An article, renamed')).toBeVisible()

  // Another bookmark's address is refused, and the field goes back.
  await section.getByTestId('unsorted-An article, renamed').click()
  await fields.getByTestId('bookmark-url-field').fill('https://example.com/later')
  await fields.getByTestId('bookmark-url-field').press('Tab')
  await expect(page.getByText('Already bookmarked as “Later”', { exact: true })).toBeVisible()
  await expect(fields.getByTestId('bookmark-url-field')).toHaveValue('https://example.com/article')

  // Deleted from there, once confirmed: its row goes.
  await fields.getByRole('button', { name: 'Delete' }).click()
  await page.getByTestId('bookmark-delete-confirm').click()
  await expect(fields).toHaveCount(0)
  await expect(section.locator('[data-unsorted-id]')).toHaveText(['Later'])

  // Its title opens the inbox note; folded, it stays so; off, it goes.
  await section.getByTestId('unsorted-title').click()
  const { noteId } = await api<Unsorted>(request, 'GET', '/bookmarks/unsorted')
  await expect(page).toHaveURL(`/notes/${noteId}`)
  await section.getByTestId('unsorted-toggle').click()
  await page.reload()
  await expect(section.getByTestId('unsorted-Later')).toBeHidden()
  await section.getByTestId('unsorted-toggle').click()
  await expect(section.getByTestId('unsorted-Later')).toBeVisible()
  await api(request, 'PATCH', '/settings', { bookmarks: false })
  await expect(section).toBeHidden()
})

test('makes a bookmark from Unsorted’s +; the same page again uses it', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const section = page.getByTestId('unsorted')
  await section.getByTestId('unsorted-new').click()
  // No web in the tests: the page can't be read, the name is typed.
  await page.getByTestId('bookmark-url').fill('tools.example.com')
  await page.getByTestId('bookmark-title').fill('Example tools')
  await page.getByTestId('bookmark-description').fill('Handy')
  await page.getByTestId('bookmark-save').click()
  await expect(section.getByTestId('unsorted-Example tools')).toBeVisible()

  // The same page again: it says so, and uses that one.
  await section.getByTestId('unsorted-new').click()
  await page.getByTestId('bookmark-url').fill('https://tools.example.com/')
  await page.getByTestId('bookmark-url').blur()
  await expect(page.getByTestId('bookmark-duplicate')).toContainText('Example tools')
  await page.getByRole('button', { name: 'Use it' }).click()
  await expect(page.getByTestId('bookmark-duplicate')).toBeHidden()
  expect(await api<Bookmark[]>(request, 'GET', '/bookmarks')).toHaveLength(1)
  await expect(section.locator('[data-unsorted-id]')).toHaveCount(1)
})

test('right-clicking Unsorted exports for Chrome, the pages as folders; a page exports its own', async ({
  page,
  request,
}) => {
  const article = await addBookmark(request, {
    url: 'https://example.com/article',
    title: 'An article',
  })
  await addBookmark(request, { url: 'https://example.com/later', title: 'Later', inbox: true })
  await createNote(request, 'Reading list', `${block(article.id)}\n`)
  await page.goto('/')
  const section = page.getByTestId('unsorted')
  await section.getByTestId('unsorted-title').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'New bookmark' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Open the inbox note' })).toBeVisible()
  const all = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export all for Chrome' }).click()
  const file = await all
  expect(file.suggestedFilename()).toMatch(/^tandem-bookmarks-\d{4}-\d{2}-\d{2}\.html$/)
  const html = await readFile((await file.path())!, 'utf8')
  expect(html).toMatch(/^<!DOCTYPE NETSCAPE-Bookmark-file-1>/)
  expect(html).toContain('>Reading list</H3>')
  expect(html).toContain('<A HREF="https://example.com/article"')
  expect(html).toContain('<A HREF="https://example.com/later"')

  // A page: from its menu in the tree, that page alone.
  await expect(page.getByRole('menu')).toBeHidden()
  await page.getByTestId('tree-Reading list').click({ button: 'right' })
  const one = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export bookmarks for Chrome' }).click()
  const only = await readFile((await (await one).path())!, 'utf8')
  expect(only).toContain('>Reading list</H3>')
  expect(only).not.toContain('Later')

  // The section takes the sidebar's room left: a right click at its very bottom works too.
  await expect(page.getByRole('menu')).toBeHidden()
  const scroller = (await section.locator('..').boundingBox())!
  const box = (await section.boundingBox())!
  expect(box.y + box.height).toBeCloseTo(scroller.y + scroller.height, 0)
  await section.click({ button: 'right', position: { x: 40, y: box.height - 5 } })
  await expect(page.getByRole('menuitem', { name: 'Export all for Chrome' })).toBeVisible()
})

test('a bookmark takes an icon where it is edited, and back to its favicon', async ({
  page,
  request,
}) => {
  const bookmark = await addBookmark(request, {
    url: 'https://read.example.com',
    title: 'Reading',
    inbox: true,
  })
  await page.goto('/')
  const row = page.getByTestId('unsorted-Reading')
  await row.click()
  const fields = page.getByTestId('bookmark-fields')
  await fields.getByRole('button', { name: 'Change icon' }).click()
  const picker = page.getByTestId('icon-picker')
  await picker.getByLabel('Search emojis').fill('books')
  await picker.getByRole('button', { name: 'books', exact: true }).click()
  await expect(row.getByTestId('bookmark-icon')).toHaveText('📚')
  expect(await api<Bookmark>(request, 'GET', `/bookmarks/${bookmark.id}`)).toMatchObject({
    emoji: '📚',
  })
  // The editor stayed open behind the picker.
  await fields.getByRole('button', { name: 'Change icon' }).click()
  await picker.getByRole('button', { name: 'Use the default icon' }).click()
  await expect(row.getByTestId('bookmark-icon')).not.toHaveText('📚')
  expect(await api<Bookmark>(request, 'GET', `/bookmarks/${bookmark.id}`)).toMatchObject({
    emoji: null,
  })
})

test('a card in a note edits its bookmark in place, from its menu', async ({ page, request }) => {
  const docs = await addBookmark(request, {
    url: 'https://docs.example.com',
    title: 'Example docs',
  })
  const note = await createNote(request, 'Card to edit', `Read:\n\n${block(docs.id)}\n`)
  await openNote(page, note.id)
  const card = page.getByTestId('bookmark-card')
  await card.getByText('Example docs').click()
  // Its menu: the website, editing, removing it (no other bookmark put in its place).
  await expect(page.getByRole('menuitem')).toHaveText([
    'Open website',
    'Edit bookmark',
    /Remove from the note/,
  ])
  await page.getByRole('menuitem', { name: 'Edit bookmark' }).click()
  // The card is its fields now, the name focused: what's typed goes there, not in the note.
  const fields = card.getByTestId('bookmark-fields')
  await expect(fields.getByTestId('bookmark-title-field')).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.type(' (new)')
  await fields.getByTestId('bookmark-description-field').fill('The reference')
  // A click elsewhere: saved, and the card is back.
  await page.getByText('Read:').click()
  await expect(fields).toHaveCount(0)
  await expect(card).toContainText('Example docs (new)')
  await expect(card).toContainText('The reference')
  await expect(page).toHaveURL(`/notes/${note.id}`)
  expect(await api<Bookmark>(request, 'GET', `/bookmarks/${docs.id}`)).toMatchObject({
    title: 'Example docs (new)',
  })
  // The note itself didn't change.
  const content = await noteContent(request, note.id)
  expect(content).toContain(block(docs.id))
  expect(content).not.toContain('(new)')
})

test('makes a new bookmark from /bookmark’s picker, and shows its card', async ({
  page,
  request,
}) => {
  await addBookmark(request, { url: 'https://old.example.com', title: 'Old one' })
  const note = await createNote(request, 'New links', 'Useful:')
  await openNote(page, note.id)
  await focusEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('/bookmark')
  await page.keyboard.press('Enter')
  const picker = page.getByTestId('bookmark-picker')
  // First, above the latest bookmarks.
  await expect(picker.getByRole('option').first()).toHaveText(/New bookmark…/)
  await picker.getByRole('option', { name: 'New bookmark…' }).click()
  // No web in the tests: the page can't be read, the name is typed.
  await page.getByTestId('bookmark-url').fill('fresh.example.com')
  await page.getByTestId('bookmark-title').fill('Fresh one')
  await page.getByTestId('bookmark-save').click()
  const card = page.getByTestId('bookmark-card')
  await expect(card).toContainText('Fresh one')
  await expect(picker).toHaveCount(0)
  await waitSaved(page)
  const made = (await api<Bookmark[]>(request, 'GET', '/bookmarks')).find(
    (b) => b.title === 'Fresh one',
  )!
  expect(await noteContent(request, note.id)).toContain(block(made.id))
  // Not in Unsorted: its card is in this note.
  await expect(page.getByTestId('unsorted-Fresh one')).toHaveCount(0)
})

/** A paste in the note, after the keys that made it: ⌘V, or ⌘⇧V (as plain text, a link). */
async function paste(page: Page, text: string, shift = false) {
  await page.evaluate(
    (input) => {
      const editor = document.querySelector<HTMLElement>('.ProseMirror')!
      const keys = {
        key: input.shift ? 'V' : 'v',
        metaKey: true,
        shiftKey: input.shift,
        bubbles: true,
      }
      editor.dispatchEvent(new KeyboardEvent('keydown', keys))
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', input.text)
      editor.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      )
    },
    { text, shift },
  )
}

test('a pasted address shows its bookmark’s card (⌘V), or a link (⌘⇧V)', async ({
  page,
  request,
}) => {
  const saved = await addBookmark(request, { url: 'https://saved.example.com', title: 'Saved' })
  const note = await createNote(request, 'Pasted links', 'Links:')
  await openNote(page, note.id)
  await focusEnd(page)
  // Already a bookmark: its card, no new one.
  await paste(page, 'https://saved.example.com/')
  const cards = page.getByTestId('bookmark-card')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Saved')
  // Not saved yet: made (no web in the tests: named after its site), then its card.
  await paste(page, 'https://fresh.example.com/page')
  await expect(cards).toHaveCount(2)
  // ⌘⇧V: a link in the text.
  await paste(page, 'https://plain.example.com/', true)
  await expect(page.locator('.ProseMirror a[href="https://plain.example.com/"]')).toBeVisible()
  await expect(cards).toHaveCount(2)
  await waitSaved(page)
  const all = await api<Bookmark[]>(request, 'GET', '/bookmarks')
  expect(all.map((b) => b.url).toSorted()).toEqual([
    'https://fresh.example.com/page',
    'https://saved.example.com/',
  ])
  const fresh = all.find((b) => b.url === 'https://fresh.example.com/page')!
  const content = await noteContent(request, note.id)
  expect(content).toContain(block(saved.id))
  expect(content).toContain(block(fresh.id))
  expect(content).toContain('https://plain.example.com/')
})

test('with bookmarks off, ⌘V pastes an address as a link', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { bookmarks: false })
  const note = await createNote(request, 'Pasted link', 'Link:')
  await openNote(page, note.id)
  await focusEnd(page)
  await paste(page, 'https://off.example.com/')
  await expect(page.locator('.ProseMirror a[href="https://off.example.com/"]')).toBeVisible()
  await expect(page.getByTestId('bookmark-card')).toHaveCount(0)
  expect(await api<Bookmark[]>(request, 'GET', '/bookmarks')).toEqual([])
})

test('shows a bookmark’s card in a note, from /, used several times, found by ⌘⇧F', async ({
  page,
  request,
}) => {
  const docs = await addBookmark(request, {
    url: 'https://docs.example.com',
    title: 'Example docs',
    description: 'The reference',
  })
  await createNote(request, 'Elsewhere', `${block(docs.id)}\n`)
  const note = await createNote(request, 'Links', 'Useful:')
  await openNote(page, note.id)
  await focusEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('/bookmark')
  await expect(page.getByText('A website’s card, from your bookmarks')).toBeVisible()
  await page.keyboard.press('Enter')
  const picker = page.getByTestId('bookmark-picker')
  await picker.getByPlaceholder('Find a bookmark, or paste an address…').fill('refer')
  await expect(picker.getByRole('option', { name: /Example docs/ })).toBeVisible()
  await page.keyboard.press('Enter')
  const card = page.getByTestId('bookmark-card')
  await expect(card).toContainText('Example docs')
  await expect(card).toContainText('docs.example.com')
  await expect(card).toContainText('The reference')
  await waitSaved(page)
  expect(await noteContent(request, note.id)).toContain(block(docs.id))
  // In two notes now: its card says so.
  await expect(card.getByTestId('bookmark-card-uses')).toHaveText('· Used 2 times')

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

  // ⌘⇧F finds bookmarks, by their description too.
  await page.keyboard.press('ControlOrMeta+Shift+F')
  await page.getByPlaceholder(/^Search notes/).fill('reference')
  await expect(page.getByRole('option', { name: /Example documentation/ })).toBeVisible()
})

test('dragged from Unsorted into a note or onto a page, a bookmark is sorted there', async ({
  page,
  request,
}) => {
  const blog = await addBookmark(request, {
    url: 'https://blog.example.com',
    title: 'Example blog',
    inbox: true,
  })
  const wiki = await addBookmark(request, {
    url: 'https://wiki.example.com',
    title: 'Example wiki',
    inbox: true,
  })
  const target = await createNote(request, 'Target page', 'Its text')
  const note = await createNote(request, 'Links', 'Useful:')
  await openNote(page, note.id)
  const section = page.getByTestId('unsorted')
  const unsorted = async () =>
    (await api<Unsorted>(request, 'GET', '/bookmarks/unsorted')).bookmarks.map((b) => b.title)

  // Into the note: a card where it's dropped, gone from the inbox note.
  await section.getByTestId('unsorted-Example blog').dragTo(page.locator('.ProseMirror p').first())
  await expect(page.getByTestId('bookmark-card')).toHaveCount(1)
  await waitSaved(page)
  expect(await noteContent(request, note.id)).toContain(block(blog.id))
  await expect.poll(unsorted).toEqual(['Example wiki'])
  await expect(section.getByTestId('unsorted-Example blog')).toHaveCount(0)

  // Onto a page of the tree: at its end.
  await section.getByTestId('unsorted-Example wiki').dragTo(page.getByTestId('tree-Target page'))
  await expect.poll(() => noteContent(request, target.id)).toBe(`Its text\n\n${block(wiki.id)}\n`)
  await expect.poll(unsorted).toEqual([])
  await expect(section.getByTestId('unsorted-empty')).toBeVisible()
})

test('the side panel lists the note’s bookmarks and links to websites', async ({
  page,
  request,
}) => {
  const docs = await addBookmark(request, {
    url: 'https://docs.example.com',
    title: 'Example docs',
  })
  const note = await createNote(
    request,
    'With links',
    `Read [the guide](https://guide.example.com) and https://bare.example.com today.\n\n${block(docs.id)}\n`,
  )
  await openNote(page, note.id)
  const panel = await openSidePanel(page, 'Items')
  await expect(panel.getByTestId('side-bookmark-Example docs')).toContainText('docs.example.com')
  await expect(panel.getByTestId('side-link-the guide')).toContainText('guide.example.com')
  await expect(panel.getByTestId('side-link-bare.example.com')).toBeVisible()
  // Edited next to its row, from its button.
  await panel.getByTestId('side-bookmark-Example docs').hover()
  await panel.getByRole('button', { name: 'Edit bookmark', exact: true }).click()
  const fields = page.getByTestId('bookmark-fields')
  await fields.getByTestId('bookmark-title-field').fill('Example docs, renamed')
  await fields.getByTestId('bookmark-title-field').press('Enter')
  await expect(panel.getByTestId('side-bookmark-Example docs, renamed')).toBeVisible()
  await expect(page).toHaveURL(`/notes/${note.id}`)
})

test('deletes a bookmark once confirmed, naming the pages that show it, and its cards go', async ({
  page,
  request,
}) => {
  const bookmark = await addBookmark(request, {
    url: 'https://gone.example.com',
    title: 'Gone',
    inbox: true,
  })
  const note = await createNote(request, 'Shows it', `Before\n\n${block(bookmark.id)}\n\nAfter\n`)
  await openNote(page, note.id)
  await expect(page.getByTestId('bookmark-card')).toContainText('Gone')
  const section = page.getByTestId('unsorted')
  await section.getByTestId('unsorted-Gone').focus()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await expect(page.getByTestId('bookmark-delete-pages')).toContainText('Shows it')
  await page.getByTestId('bookmark-delete-confirm').click()
  await expect(section.getByTestId('unsorted-Gone')).toBeHidden()
  // The open note shows it at once, and its file no longer has it.
  await expect(page.getByTestId('bookmark-card')).toHaveCount(0)
  expect(await noteContent(request, note.id)).toBe('Before\n\nAfter\n')
})
