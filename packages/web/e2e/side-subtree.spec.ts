// The side panel on a page with sub-pages: their files (and links, bookmarks, databases) too,
// nested and foldable as in the sidebar's tree, or in one flat list, sorted.
import { expect, test, type APIRequestContext } from '@playwright/test'
import { api, createNote, openNote } from './helpers'

function attach(request: APIRequestContext, id: string, name: string, size: number) {
  return request.post(`/api/notes/${id}/attachments`, {
    multipart: { file: { name, mimeType: 'text/plain', buffer: Buffer.alloc(size, 'a') } },
  })
}

test('a page’s side panel shows its sub-pages’ files, as a tree or a flat list', async ({
  page,
  request,
}) => {
  const parent = await createNote(request, 'Subtree parent', 'Top')
  const child = await createNote(request, 'Subtree child', 'Below', 'owner', parent.id)
  await attach(request, parent.id, 'a-small.txt', 10)
  const middle = await createNote(request, 'Subtree middle', 'No files', 'owner', parent.id)
  const deep = await createNote(request, 'Subtree deep', 'Below', 'owner', middle.id)
  await attach(request, child.id, 'z-big.txt', 5000)
  await attach(request, deep.id, 'm-deep.txt', 20)
  await openNote(page, parent.id)
  const panel = page.locator('#tandem-panels-panel-note-side')
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'Toggle side panel' }).click()
  }
  await page.getByRole('tab', { name: 'Files' }).click()

  // Tree: this page's files as usual, then the sub-pages nested as in the sidebar: the page
  // between, holding none, shows to reach the one under it; folding it hides that one.
  await panel.getByRole('radio', { name: 'Tree' }).click()
  await expect(panel.getByText('a-small.txt')).toBeVisible()
  const group = panel.getByTestId('side-group-Subtree child')
  await expect(group).toContainText('z-big.txt')
  await expect(group).toContainText('4,9 Ko')
  const middleGroup = panel.getByTestId('side-group-Subtree middle')
  await expect(middleGroup.getByTestId('side-group-Subtree deep')).toContainText('m-deep.txt')
  await expect(middleGroup.getByTestId('side-group-count').first()).toHaveText('1')
  await middleGroup.getByRole('button', { name: 'Fold Subtree middle' }).click()
  await expect(panel.getByText('m-deep.txt')).toBeHidden()
  await middleGroup.getByRole('button', { name: 'Unfold Subtree middle' }).click()
  await expect(panel.getByText('m-deep.txt')).toBeVisible()

  // Flat: all of them, each naming its page; sorted by size, the largest first.
  await panel.getByRole('radio', { name: 'Flat' }).click()
  const flat = panel.getByTestId('side-flat')
  await expect(flat.getByTestId('side-item-z-big.txt')).toContainText('Subtree child')
  await panel.getByTestId('side-sort').click()
  await page.getByRole('option', { name: 'Size' }).click()
  await expect(flat.locator('[role=button][data-testid^="side-item-"]')).toHaveText([
    /z-big\.txt/,
    /m-deep\.txt/,
    /a-small\.txt/,
  ])
  await panel.getByTestId('side-sort').click()
  await page.getByRole('option', { name: 'Name' }).click()
  await expect(flat.locator('[role=button][data-testid^="side-item-"]')).toHaveText([
    /a-small\.txt/,
    /m-deep\.txt/,
    /z-big\.txt/,
  ])

  // A tab with nothing, in the page or under it: no choice to make, its empty state alone.
  await page.getByRole('tab', { name: 'Databases' }).click()
  await expect(panel.getByText('No databases')).toBeVisible()
  await expect(panel.getByTestId('side-display')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Files' }).click()

  // A click on a sub-page's title opens it (back to Tree); a page without sub-pages has no choice.
  await panel.getByRole('radio', { name: 'Tree' }).click()
  await group.getByRole('button', { name: 'Subtree child', exact: true }).click()
  await expect(page).toHaveURL(`/notes/${child.id}`)
  await expect(panel.getByTestId('side-display')).toHaveCount(0)

  await api(request, 'DELETE', `/nodes/${parent.id}`)
})
