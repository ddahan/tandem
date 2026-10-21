// Tabs, as in VS Code: a click in the tree previews a page, a double click or an edit keeps it
// open, closing shows the tab used before, and the tabs come back after a reload.
import { expect, test, type Page } from '@playwright/test'
import { api, createNote, focusEnd, noteContent } from './helpers'

const tabBar = (page: Page) => page.getByTestId('tab-bar')
const tab = (page: Page, title: string) =>
  tabBar(page).getByRole('tab', { name: title, exact: true })
/** The tabs' titles in order, the active one marked with *. */
const tabTitles = (page: Page) =>
  tabBar(page)
    .getByRole('tab')
    .evaluateAll((tabs) =>
      tabs.map(
        (t) => `${t.textContent?.trim()}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`,
      ),
    )
const isPreview = (page: Page, title: string) =>
  tab(page, title)
    .locator('.italic')
    .count()
    .then((count) => count > 0)

test('previews a page from the tree, keeps it with a double click or an edit', async ({
  page,
  request,
}) => {
  await createNote(request, 'Tab one', 'One.')
  await createNote(request, 'Tab two', 'Two.')
  await createNote(request, 'Tab three', 'Three.')
  await page.goto('/')
  await expect(tabBar(page)).toHaveCount(0)

  // A click previews (in italics); the next one replaces the preview.
  await page.getByTestId('tree-Tab one').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Tab one*'])
  expect(await isPreview(page, 'Tab one')).toBe(true)
  await page.getByTestId('tree-Tab two').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Tab two*'])

  // A double click keeps it open; the next click opens a new preview next to it.
  await page.getByTestId('tree-Tab two').dblclick()
  await expect.poll(() => isPreview(page, 'Tab two')).toBe(false)
  await page.getByTestId('tree-Tab three').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Tab two', 'Tab three*'])
  expect(await isPreview(page, 'Tab three')).toBe(true)

  // Editing the previewed page keeps it open too.
  await focusEnd(page)
  await page.keyboard.type(' Edited.')
  await expect.poll(() => isPreview(page, 'Tab three')).toBe(false)
  await expect.poll(() => noteContent(request, 'Tab three')).toBe('Three. Edited.\n')

  // The preview tab closes once another page shows.
  await page.getByTestId('tree-Tab one').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Tab two', 'Tab three', 'Tab one*'])
  await tab(page, 'Tab two').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Tab two*', 'Tab three'])

  // A double click on a preview tab keeps it open as well.
  await page.getByTestId('tree-Tab one').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Tab two', 'Tab one*', 'Tab three'])
  await tab(page, 'Tab one').dblclick()
  await expect.poll(() => isPreview(page, 'Tab one')).toBe(false)
  await tab(page, 'Tab three').click()
  await expect.poll(() => tabTitles(page)).toEqual(['Tab two', 'Tab one', 'Tab three*'])
})

test('closes tabs, showing the one used before, and reopens them', async ({ page, request }) => {
  await createNote(request, 'Close A', 'A.')
  await createNote(request, 'Close B', 'B.')
  await createNote(request, 'Close C', 'C.')
  await page.goto('/')
  for (const title of ['Close A', 'Close B', 'Close C'])
    await page.getByTestId(`tree-${title}`).dblclick()
  await expect.poll(() => tabTitles(page)).toEqual(['Close A', 'Close B', 'Close C*'])

  // The app's pages open in tabs too.
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click()
  await expect.poll(() => tabTitles(page)).toEqual(['Close A', 'Close B', 'Close C', 'Settings*'])

  // × closes: the tab used before shows (not the one next to it).
  await tab(page, 'Close A').click()
  await tab(page, 'Settings').click()
  await tab(page, 'Settings').getByRole('button', { name: 'Close tab' }).click()
  await expect.poll(() => tabTitles(page)).toEqual(['Close A*', 'Close B', 'Close C'])
  await expect(page).toHaveTitle(/^Close A/)

  // ⌥⌘T reopens it; ⌥⌘W closes the active tab; a middle click closes one.
  await page.keyboard.press('ControlOrMeta+Alt+T')
  await expect.poll(() => tabTitles(page)).toEqual(['Close A', 'Settings*', 'Close B', 'Close C'])
  await page.keyboard.press('ControlOrMeta+Alt+W')
  await expect.poll(() => tabTitles(page)).toEqual(['Close A*', 'Close B', 'Close C'])
  await tab(page, 'Close B').click({ button: 'middle' })
  await expect.poll(() => tabTitles(page)).toEqual(['Close A*', 'Close C'])

  // ⌃2 goes to the second tab, ⌥⌘→ to the next one (wrapping around).
  await page.keyboard.press('Control+2')
  await expect.poll(() => tabTitles(page)).toEqual(['Close A', 'Close C*'])
  await page.keyboard.press('ControlOrMeta+Alt+ArrowRight')
  await expect.poll(() => tabTitles(page)).toEqual(['Close A*', 'Close C'])

  // The menu closes the others; closing the last one shows Home.
  await tab(page, 'Close C').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Close others' }).click()
  await expect.poll(() => tabTitles(page)).toEqual(['Close C*'])
  await page.keyboard.press('ControlOrMeta+Alt+W')
  await expect(tabBar(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
})

test('reorders tabs by dragging, and keeps them after a reload', async ({ page, request }) => {
  await createNote(request, 'Keep 1', 'One.')
  await createNote(request, 'Keep 2', 'Two.')
  await page.goto('/')
  await page.getByTestId('tree-Keep 1').dblclick()
  await page.getByTestId('tree-Keep 2').dblclick()
  await expect.poll(() => tabTitles(page)).toEqual(['Keep 1', 'Keep 2*'])

  // Dropped on the left half of the first tab: before it.
  const target = (await tab(page, 'Keep 1').boundingBox())!
  await tab(page, 'Keep 2').hover()
  await page.mouse.down()
  await page.mouse.move(target.x + 8, target.y + target.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => tabTitles(page)).toEqual(['Keep 2*', 'Keep 1'])

  // Opening Tandem on Home brings back the tabs and the active one.
  await page.goto('/')
  await expect(page).toHaveTitle(/^Keep 2/)
  await expect.poll(() => tabTitles(page)).toEqual(['Keep 2*', 'Keep 1'])
})

test('closes the tab of a page moved to the trash', async ({ page, request }) => {
  await createNote(request, 'Stays open', 'Stays.')
  const gone = await createNote(request, 'Goes away', 'Gone.')
  await page.goto('/')
  await page.getByTestId('tree-Stays open').dblclick()
  await page.getByTestId('tree-Goes away').dblclick()
  await expect.poll(() => tabTitles(page)).toEqual(['Stays open', 'Goes away*'])

  // From another client (an agent): the tab closes, the one used before shows.
  await api(request, 'DELETE', `/nodes/${gone.id}`)
  await expect.poll(() => tabTitles(page)).toEqual(['Stays open*'])
  await expect(page).toHaveTitle(/^Stays open/)
})

test('shares the page’s bar: two rows at most, the rest in “+N”, the active one always shown', async ({
  page,
  request,
}) => {
  const titles = Array.from({ length: 16 }, (_, i) => `Many tabs number ${i + 1}`)
  const notes = []
  for (const title of titles) notes.push(await createNote(request, title, 'Text.'))
  // Saved tabs, as a reload finds them: the last one active.
  await page.goto('/')
  await page.evaluate(
    (ids) => {
      const tabs = ids.map((id) => ({ key: `note:${id}`, path: `/notes/${id}`, preview: false }))
      localStorage.setItem('tandem-tabs', JSON.stringify({ tabs, recent: [tabs.at(-1)!.key] }))
    },
    notes.map((n) => n.id),
  )
  await page.goto('/')
  await expect(page).toHaveTitle(/^Many tabs number 16/)

  // One bar: the tabs, and the note's actions on the same row.
  const bar = tabBar(page)
  const navbar = page.locator('[data-slot="root"]', { has: bar })
  await expect(navbar.getByRole('button', { name: 'More actions' })).toBeVisible()

  // Two rows, the rest in "+N"; the active tab (the last) is among those shown.
  const more = bar.getByRole('button', { name: /more tabs$/ })
  await expect(more).toBeVisible()
  const rows = await bar
    .locator('[data-tab-chip], [data-tab-more]')
    .evaluateAll(
      (items) => new Set(items.map((i) => Math.round(i.getBoundingClientRect().top))).size,
    )
  expect(rows).toBe(2)
  await expect(tab(page, 'Many tabs number 16')).toHaveAttribute('aria-selected', 'true')
  const shown = await bar.locator('[data-tab-chip]').count()
  await expect(more).toHaveText(`+${titles.length - shown}`)

  // A hidden tab, from "+N": shown and active, the tabs' order unchanged.
  await more.click()
  await page.getByRole('menuitem', { name: 'Many tabs number 14' }).click()
  await expect(tab(page, 'Many tabs number 14')).toHaveAttribute('aria-selected', 'true')
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('tandem-tabs')!).tabs.map((t: { key: string }) => t.key),
  )
  expect(saved).toEqual(notes.map((n) => `note:${n.id}`))
})

test('shows a page’s path on its tab, and its parent pages above its title', async ({
  page,
  request,
}) => {
  const parent = await createNote(request, 'Path parent', 'Parent.')
  const child = await createNote(request, 'Path child', 'Child.', 'owner', parent.id)
  await page.goto(`/notes/${child.id}`)
  await expect(page.getByTestId('note-path')).toContainText('Path parent')
  await expect(page.getByTestId('note-path')).not.toContainText('Path child')
  await tab(page, 'Path child').hover()
  await expect(page.getByTestId('tab-path')).toContainText('Path parent')
  await expect(page.getByTestId('tab-path')).toContainText('Path child')

  // A page at the top has no path above its title.
  await page.getByTestId('note-path').getByRole('link', { name: 'Path parent' }).click()
  await expect(page).toHaveTitle(/^Path parent/)
  await expect(page.getByTestId('note-path')).toHaveCount(0)
})
