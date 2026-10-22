// Undo and redo (⌘Z, ⌘⇧Z): one history for the app, in the order things were done: a note's
// text, its databases, the pages. A text field being typed in keeps its own undo first.
import { expect, test, type APIRequestContext } from '@playwright/test'
import { api, createNote, noteContent, openNote, waitSaved } from './helpers'

interface Database {
  id: string
  columns: { id: string; name: string; type: string }[]
  rows: { id: string; cells: Record<string, unknown> }[]
}

async function databaseIn(request: APIRequestContext, noteId: string, names: string[]) {
  const database = await api<Database>(request, 'POST', `/notes/${noteId}/databases`, {
    columns: [
      { name: 'Task', type: 'text' },
      { name: 'Points', type: 'number' },
    ],
  })
  const [task, points] = database.columns
  for (const [index, name] of names.entries()) {
    const cells = { [task!.id]: name, [points!.id]: index + 1 }
    if (index === 0) {
      await api(request, 'PATCH', `/databases/${database.id}/rows/${database.rows[0]!.id}`, {
        cells,
      })
    } else await api(request, 'POST', `/databases/${database.id}/rows`, { cells })
  }
  await api(request, 'POST', `/notes/${noteId}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  const tasks = async () => {
    const latest = await api<Database>(request, 'GET', `/databases/${database.id}`)
    return latest.rows.map((row) => row.cells[task!.id] ?? null)
  }
  const columns = async () =>
    (await api<Database>(request, 'GET', `/databases/${database.id}`)).columns.map((c) => c.name)
  const values = async (columnId: string) =>
    (await api<Database>(request, 'GET', `/databases/${database.id}`)).rows.map(
      (row) => row.cells[columnId] ?? null,
    )
  return { tasks, columns, values, points: points! }
}

test('undoes and redoes database changes and typing, in the order they were made', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Undo table', 'Intro')
  const { tasks } = await databaseIn(request, note.id, ['A', 'B'])
  await openNote(page, note.id)
  const block = page.getByTestId('database')
  const cells = block.getByRole('textbox', { name: 'Task' })
  await expect(cells).toHaveCount(2)

  // Typing in the note, then a value, then a row deleted (at once: ⌘Z brings it back).
  await page.locator('.ProseMirror p', { hasText: 'Intro' }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' text')
  await waitSaved(page)
  await cells.nth(1).fill('B2')
  await cells.nth(1).press('Enter')
  await expect.poll(tasks).toEqual(['A', 'B2'])
  await block.getByTestId('database-row').first().hover()
  await block.getByRole('button', { name: 'Delete the row' }).first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(tasks).toEqual(['B2'])

  // Undone last first: the row (in its place, with its values), the value, the typing.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(tasks).toEqual(['A', 'B2'])
  await expect(cells.first()).toHaveValue('A')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(tasks).toEqual(['A', 'B'])
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.ProseMirror p').first()).toHaveText('Intro')

  // Redone in order.
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.locator('.ProseMirror p').first()).toHaveText('Intro text')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(tasks).toEqual(['A', 'B2'])
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(tasks).toEqual(['B2'])
  await expect.poll(() => noteContent(request, note.id)).toMatch(/^Intro text\n/)
})

test('a deleted column comes back with its values', async ({ page, request }) => {
  const note = await createNote(request, 'Undo column', 'Intro')
  const { columns, values, points } = await databaseIn(request, note.id, ['A', 'B'])
  await openNote(page, note.id)
  const block = page.getByTestId('database')
  await block.getByRole('button', { name: 'Points' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(columns).toEqual(['Task'])
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(columns).toEqual(['Task', 'Points'])
  await expect(block.getByRole('textbox', { name: 'Points' }).nth(1)).toHaveValue('2')
  expect(await values(points.id)).toEqual([1, 2])
})

test('a cell being typed in undoes its typing first, then the history', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Undo field', 'Intro')
  const { tasks } = await databaseIn(request, note.id, ['A', 'B'])
  await openNote(page, note.id)
  const cells = page.getByTestId('database').getByRole('textbox', { name: 'Task' })
  await cells.first().fill('A2')
  await cells.first().press('Enter')
  await expect.poll(tasks).toEqual(['A2', 'B'])

  await cells.nth(1).click()
  await page.keyboard.press('End')
  await page.keyboard.type('xyz')
  // The field's own undo: the typing goes, nothing is saved.
  await page.keyboard.press('ControlOrMeta+z')
  await expect(cells.nth(1)).toHaveValue('B')
  // Nothing typed any more: the history (the first cell's value), the cursor staying here.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(tasks).toEqual(['A', 'B'])
  await expect(cells.first()).toHaveValue('A')
  await expect(cells.nth(1)).toBeFocused()
})

test('pages: renaming and moving to the trash are undone and redone', async ({ page, request }) => {
  await createNote(request, 'Undo page', 'Text')
  await page.goto('/')
  const row = (name: string) => page.getByTestId(`tree-${name}`)

  await row('Undo page').focus()
  await page.keyboard.press('F2')
  await expect(page.getByLabel('New title')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Undo renamed')
  await page.keyboard.press('Enter')
  await expect(row('Undo renamed')).toBeVisible()

  await row('Undo renamed').focus()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await expect(row('Undo renamed')).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(row('Undo renamed')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(row('Undo page')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(row('Undo renamed')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(row('Undo renamed')).toHaveCount(0)
})

test('a step undone from another note says where', async ({ page, request }) => {
  const note = await createNote(request, 'Undo elsewhere', 'Intro')
  const other = await createNote(request, 'Undo other', 'Other')
  const { tasks } = await databaseIn(request, note.id, ['A'])
  await openNote(page, note.id)
  const cell = page.getByTestId('database').getByRole('textbox', { name: 'Task' })
  await cell.fill('A2')
  await cell.press('Enter')
  await expect.poll(tasks).toEqual(['A2'])

  await page.getByTestId(`tree-${other.title}`).click()
  await expect(page).toHaveTitle(new RegExp(`^${other.title}`))
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(tasks).toEqual(['A'])
  await expect(page.getByText('Undone: Edit a cell').first()).toBeVisible()
  await expect(page.getByText(`In “${note.title}”.`).first()).toBeVisible()
})
