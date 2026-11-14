// Several rows selected in the pages' tree (⌘- and ⇧-click): opened in tabs, moved (from the
// menu, or dragged), deleted at once (⌘⌫).
import { expect, test, type Page } from '@playwright/test'
import { api, createNote } from './helpers'

interface Node {
  id: string
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
