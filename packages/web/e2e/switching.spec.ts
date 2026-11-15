// Going from page to page must cost little (docs/architecture.md › Page switches): the tab bar
// is made once, and what a page shows only on hover or when needed (a row's buttons, a block's
// controls, the editor's toolbars) is made then. These check that what is made late still works.
import { expect, test } from '@playwright/test'
import { createNote, noteContent, openNote } from './helpers'

test('keeps one tab bar from page to page, and a press on a tab shows its page', async ({
  page,
  request,
}) => {
  const first = await createNote(request, 'Bar first', 'First.')
  await createNote(request, 'Bar second', 'Second.')
  await openNote(page, first.id)
  await page.getByTestId('tree-Bar second').dblclick()
  await expect(page).toHaveTitle(/^Bar second/)

  // The same bar, not one made again by each page.
  const bar = page.getByTestId('tab-bar')
  await bar.evaluate((element) => element.setAttribute('data-kept', 'yes'))
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveTitle(/^Settings/)
  await expect(bar).toHaveAttribute('data-kept', 'yes')
  await expect(bar.getByRole('tab')).toHaveCount(3)

  // The press is enough (the mouse button still down), as on a browser's tabs.
  await bar.getByRole('tab', { name: 'Bar first', exact: true }).hover()
  await page.mouse.down()
  await expect(page).toHaveTitle(/^Bar first/)
  await expect(bar).toHaveAttribute('data-kept', 'yes')
  await page.mouse.up()
  await expect(bar.getByRole('tab', { name: 'Bar first', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('makes a tree row’s buttons when the pointer reaches it', async ({ page, request }) => {
  await createNote(request, 'Lazy row', 'Text.')
  await page.goto('/')
  const row = page.getByTestId('tree-Lazy row')
  await expect(row).toBeVisible()
  await expect(row.getByRole('button', { name: 'Actions' })).toHaveCount(0)
  await row.hover()
  await row.getByRole('button', { name: 'Actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
})

test('shows the selection’s toolbar once text is selected, and formats with it', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Toolbar note', 'Hello world.')
  await openNote(page, note.id)
  const toolbar = page.getByRole('toolbar')
  await expect(toolbar).toHaveCount(0)

  await page.locator('.ProseMirror').click()
  await page.keyboard.press('ControlOrMeta+a')
  await expect(toolbar).toBeVisible()
  // "Turn into", then Bold.
  await toolbar.getByRole('button').nth(1).click()
  await expect.poll(() => noteContent(request, note.id)).toBe('**Hello world.**\n')
})

test('shows a table’s toolbar with the cursor in the table', async ({ page, request }) => {
  const note = await createNote(request, 'Table bar', '| A | B |\n| --- | --- |\n| 1 | 2 |\n')
  await openNote(page, note.id)
  await expect(page.getByRole('toolbar')).toHaveCount(0)

  await page.locator('.ProseMirror td').first().click()
  const toolbar = page.getByRole('toolbar')
  await expect(toolbar).toBeVisible()
  // Add row.
  await toolbar.getByRole('button').first().click()
  await expect(page.locator('.ProseMirror tr')).toHaveCount(3)
})

test('makes a code block’s controls on hover, a callout’s menu on a click', async ({
  page,
  request,
}) => {
  const note = await createNote(
    request,
    'Late controls',
    '```js\nconst a = 1\n```\n\n> [!NOTE]\n> Careful.\n',
  )
  await openNote(page, note.id)

  // The code block: its language picker and copy button come with the pointer.
  const copy = page.getByRole('button', { name: 'Copy code' })
  await expect(copy).toHaveCount(0)
  await page.getByTestId('code-block-source').hover()
  await expect(copy).toBeVisible()
  await page.locator('.ProseMirror button[aria-haspopup="listbox"]').click()
  await page.getByRole('option', { name: 'python' }).click()
  await expect.poll(() => noteContent(request, note.id)).toContain('```python\n')

  // The callout: a click on its type opens the types.
  await page.locator('.callout').getByRole('button', { name: 'Note' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Warning' }).click()
  await expect.poll(() => noteContent(request, note.id)).toContain('> [!WARNING]')
})
