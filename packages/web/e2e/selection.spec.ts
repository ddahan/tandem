// Several rows selected in the sidebar's trees (⌘- and ⇧-click): opened in tabs, moved (from the
// menu, or dragged), deleted at once (⌘⌫), for pages and for bookmarks.
import { expect, test, type Page } from '@playwright/test'
import { api, createNote } from './helpers'

interface Node {
  id: string
  parentId: string | null
}

interface Bookmark {
  id: string
  title: string
  parentId: string | null
}

const meta = { modifiers: ['ControlOrMeta' as const] }
const parentOf = async (page: Page, id: string) =>
  (await api<{ node: Node }>(page.request, 'GET', `/notes/${id}`)).node.parentId

test('pages: selected with ⌘ and ⇧, opened in tabs, moved, trashed at once', async ({
  page,
  request,
}) => {
  const box = await createNote(request, 'Sel box')
  const inside = await createNote(request, 'Sel inside', 'In.', 'owner', box.id)
  const one = await createNote(request, 'Sel one', 'One.')
  const two = await createNote(request, 'Sel two', 'Two.')
  const three = await createNote(request, 'Sel three', 'Three.')
  await page.goto('/')
  const row = (title: string) => page.getByTestId(`tree-${title}`)

  // ⌘-click: picked, nothing opens.
  await row('Sel one').click(meta)
  await row('Sel three').click(meta)
  await expect(row('Sel one')).toHaveAttribute('data-selected', 'true')
  await expect(row('Sel three')).toHaveAttribute('data-selected', 'true')
  await expect(row('Sel two')).not.toHaveAttribute('data-selected')
  await expect(page).toHaveURL(/\/$/)

  // Its menu acts on all of them: into a folder, at once.
  await row('Sel one').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Open 2 in tabs' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Move to' }).click()
  await page.getByRole('menuitem', { name: 'Sel box', exact: true }).click()
  await expect.poll(() => parentOf(page, one.id)).toBe(box.id)
  await expect.poll(() => parentOf(page, three.id)).toBe(box.id)
  await expect(page.locator('[data-node-id][data-selected]')).toHaveCount(0)
  await row('Sel box').getByRole('button', { name: 'Expand' }).click()

  // ⇧-click: the rows shown between; ⌘⌫ moves them to the trash at once, Undo brings them back.
  await row('Sel inside').click()
  await row('Sel three').click({ modifiers: ['Shift'] })
  await expect(page.locator('[data-node-id][data-selected]')).toHaveCount(3)
  await row('Sel one').focus()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await expect(page.getByText('3 pages moved to the trash').first()).toBeVisible()
  await expect(row('Sel inside')).toHaveCount(0)
  await expect(row('Sel three')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(row('Sel inside')).toBeVisible()
  await expect(row('Sel three')).toBeVisible()
  await expect.poll(() => parentOf(page, inside.id).catch(() => null)).toBe(box.id)

  // Esc lets go; then two opened in tabs of their own.
  await row('Sel two').click(meta)
  await row('Sel one').click(meta)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-node-id][data-selected]')).toHaveCount(0)
  await row('Sel two').click()
  await row('Sel one').click(meta)
  await row('Sel one').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Open 2 in tabs' }).click()
  await expect(page.getByTestId('tab-Sel two')).toBeVisible()
  await expect(page.getByTestId('tab-Sel one')).toBeVisible()

  // Dragged together onto a folder: both go in.
  await row('Sel two').click()
  await row('Sel one').click(meta)
  await row('Sel one').dragTo(row('Sel box'))
  await expect.poll(() => parentOf(page, two.id)).toBe(box.id)
  expect(await parentOf(page, one.id)).toBe(box.id)

  // Others count the pages.
  for (const id of [box.id, one.id, two.id, three.id]) {
    await request.delete(`/api/nodes/${id}`)
  }
})

test('bookmarks: selected with ⌘, moved into a folder, deleted with one question', async ({
  page,
  request,
}) => {
  await api(request, 'PATCH', '/settings', { bookmarks: true })
  for (const bookmark of await api<Bookmark[]>(request, 'GET', '/bookmarks')) {
    if (!bookmark.parentId) await api(request, 'DELETE', `/bookmarks/${bookmark.id}`)
  }
  const add = (fields: Record<string, unknown>) =>
    api<Bookmark>(request, 'POST', '/bookmarks', fields)
  const target = await add({ kind: 'folder', title: 'Target' })
  const a = await add({ url: 'https://a.example.com', title: 'Site A' })
  const b = await add({ url: 'https://b.example.com', title: 'Site B' })
  const c = await add({ url: 'https://c.example.com', title: 'Site C' })
  await page.goto('/')
  const section = page.getByTestId('bookmarks')
  await section.getByTestId('bookmarks-toggle').click()
  const row = (title: string) => section.getByTestId(`bookmark-${title}`)

  await row('Site A').click(meta)
  await row('Site C').click(meta)
  await expect(page.locator('[data-bookmark-id][data-selected]')).toHaveCount(2)
  await row('Site C').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Open 2 websites' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Move to' }).click()
  await page.getByRole('menuitem', { name: 'Target' }).click()
  const parent = async (id: string) =>
    (await api<Bookmark>(request, 'GET', `/bookmarks/${id}`)).parentId
  await expect.poll(() => parent(a.id)).toBe(target.id)
  expect(await parent(c.id)).toBe(target.id)
  expect(await parent(b.id)).toBeNull()

  // The folder (with what it holds) and a bookmark: asked once, then all gone.
  await row('Site B').click(meta)
  await row('Target').click(meta)
  await row('Target').focus()
  await page.keyboard.press('ControlOrMeta+Backspace')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Delete 2 bookmarks and folders?')
  await expect(dialog).toContainText('4 in all')
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(row('Site B')).toHaveCount(0)
  await expect(row('Target')).toHaveCount(0)
  expect(await api<Bookmark[]>(request, 'GET', '/bookmarks')).toHaveLength(0)
  await api(request, 'PATCH', '/settings', { bookmarks: false })
})
