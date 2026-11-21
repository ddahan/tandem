// Favorites (Settings › Features, off by default): shortcuts to pages above the tree, added by
// dragging a page there or from its menu, reordered by dragging, removed without touching the page.
import { expect, test } from '@playwright/test'
import { api, createNote } from './helpers'

interface Settings {
  favorites: boolean
  favoriteIds: string[]
}

const ids: string[] = []

test.afterEach(async ({ request }) => {
  await api(request, 'PATCH', '/settings', { favorites: false, favoriteIds: [] })
  // Others count the pages.
  for (const id of ids.splice(0)) await request.delete(`/api/nodes/${id}`)
})

const favoriteIds = async (request: Parameters<typeof api>[0]) =>
  (await api<Settings>(request, 'GET', '/settings')).favoriteIds

test('is off by default, and turned on in Settings › Features', async ({ page, request }) => {
  expect(await api<Settings>(request, 'GET', '/settings')).toMatchObject({
    favorites: false,
    favoriteIds: [],
  })
  const note = await createNote(request, 'Fav hidden')
  ids.push(note.id)
  await page.goto('/settings/features')
  await expect(page.getByTestId('tree-Fav hidden')).toBeVisible()
  await expect(page.getByTestId('favorites')).toHaveCount(0)
  await page.getByTestId('tree-Fav hidden').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Add to favorites' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByTestId('features').getByRole('switch', { name: 'Favorites' }).click()
  await expect(page.getByTestId('favorites-empty')).toBeVisible()
  await expect
    .poll(async () => (await api<Settings>(request, 'GET', '/settings')).favorites)
    .toBe(true)
})

test('adds pages by dragging or from the menu, reorders and removes them', async ({
  page,
  request,
}) => {
  const one = await createNote(request, 'Fav one')
  const two = await createNote(request, 'Fav two')
  const three = await createNote(request, 'Fav three')
  ids.push(one.id, two.id, three.id)
  await api(request, 'PATCH', '/settings', { favorites: true })
  await page.goto('/')
  const favorites = page.getByTestId('favorites')

  // Dragged from the tree: added, and still in the tree.
  await page.getByTestId('tree-Fav one').dragTo(page.getByTestId('favorites-empty'))
  await expect(favorites.getByTestId('favorite-Fav one')).toBeVisible()
  await expect(page.getByTestId('tree-Fav one')).toBeVisible()
  await expect.poll(() => favoriteIds(request)).toEqual([one.id])

  // From the tree's menu, at the end.
  await page.getByTestId('tree-Fav two').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Add to favorites' }).click()
  await expect.poll(() => favoriteIds(request)).toEqual([one.id, two.id])

  // Dragged onto the top half of the first favorite: before it.
  await page.getByTestId('tree-Fav three').dragTo(favorites.getByTestId('favorite-Fav one'), {
    targetPosition: { x: 20, y: 3 },
  })
  await expect.poll(() => favoriteIds(request)).toEqual([three.id, one.id, two.id])

  // Reordered by dragging a favorite onto the bottom half of another one: after it.
  await favorites
    .getByTestId('favorite-Fav three')
    .dragTo(favorites.getByTestId('favorite-Fav two'), {
      targetPosition: { x: 20, y: 24 },
    })
  await expect.poll(() => favoriteIds(request)).toEqual([one.id, two.id, three.id])
  await expect(favorites.locator('[data-favorite-id]')).toHaveText([
    'Fav one',
    'Fav two',
    'Fav three',
  ])

  // ⌥↑ moves one up.
  await favorites.getByTestId('favorite-Fav two').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(() => favoriteIds(request)).toEqual([two.id, one.id, three.id])

  // A click opens it, as in the tree.
  await favorites.getByTestId('favorite-Fav one').click()
  await expect(page).toHaveURL(new RegExp(`/notes/${one.id}`))

  // ⌘⌫ removes it from the favorites, not the page.
  await favorites.getByTestId('favorite-Fav one').focus()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await expect.poll(() => favoriteIds(request)).toEqual([two.id, three.id])
  await expect(page.getByTestId('tree-Fav one')).toBeVisible()

  // In the trash, it isn't shown; restored, it's back in its place.
  const { trashId } = await api<{ trashId: string }>(request, 'DELETE', `/nodes/${two.id}`)
  await expect(favorites.getByTestId('favorite-Fav two')).toHaveCount(0)
  await api(request, 'POST', `/trash/${trashId}/restore`)
  await expect(favorites.locator('[data-favorite-id]')).toHaveText(['Fav two', 'Fav three'])

  // The menu removes one too.
  await favorites.getByTestId('favorite-Fav three').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Remove from favorites' }).click()
  await expect.poll(() => favoriteIds(request)).toEqual([two.id])
})
