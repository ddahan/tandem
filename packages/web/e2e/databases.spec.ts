// Databases: inserted from the slash menu, edited in place, sorted and filtered, listed in the
// side panel; their data in Tandem, only their block in the note.
import { expect, test } from '@playwright/test'
import type { Editor } from '@tiptap/core'
import { api, createNote, noteContent, openNote, waitSaved } from './helpers'

interface Database {
  id: string
  columns: { id: string; name: string; type: string; width?: number }[]
  sort: { column: string; direction: string } | null
  filters: unknown[]
  rows: { id: string; cells: Record<string, unknown> }[]
}

test('inserts a database, edits it in place, and saves only its block in the note', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Books', 'My books.')
  await openNote(page, note.id)
  // At the end of the text. Right after the note opens, the editor can miss a click (the
  // page shows the cursor, the editor keeps its own): check the editor's.
  await expect(async () => {
    await page.locator('.ProseMirror p', { hasText: 'My books.' }).click()
    await page.keyboard.press('ControlOrMeta+End')
    const at = await page.evaluate(() => {
      const { state } = (document.querySelector('.ProseMirror') as unknown as { editor: Editor })
        .editor
      return state.selection.from === state.doc.content.size - 1
    })
    expect(at).toBe(true)
  }).toPass()
  await page.keyboard.press('Enter')
  await page.keyboard.type('/database')
  await expect(page.getByText('Rows you can sort and filter')).toBeVisible()
  await page.keyboard.press('Enter')
  const block = page.getByTestId('database')
  await expect(block).toBeVisible()
  // The cursor goes on after it.
  await page.keyboard.type('After.')
  await waitSaved(page)
  const content = await noteContent(request, note.id)
  const id = /```database\nid: (\S+)\n```/.exec(content)?.[1] ?? ''
  expect(content).toBe(`My books.\n\n\`\`\`database\nid: ${id}\n\`\`\`\n\nAfter.\n`)

  // A title, a value, a new column (named right away), a new row.
  await block.getByLabel('Database title').fill('Reading list')
  await block.getByLabel('Database title').press('Enter')
  await block.getByRole('textbox', { name: 'Name' }).fill('Dune')
  await block.getByRole('textbox', { name: 'Name' }).press('Enter')
  await block.getByRole('button', { name: 'Add a column' }).click()
  await block.getByLabel('Column name').fill('Pages')
  await block.getByLabel('Column name').press('Enter')
  await block.getByRole('button', { name: 'New row' }).click()
  await expect(block.getByTestId('database-row')).toHaveCount(2)
  await block.getByRole('textbox', { name: 'Name' }).nth(1).fill('Solaris')
  await block.getByRole('textbox', { name: 'Name' }).nth(1).press('Enter')

  // Pages becomes a number column.
  await block.getByRole('button', { name: 'Pages' }).click()
  await page.getByRole('menuitem', { name: 'Type' }).hover()
  await page.getByRole('menuitemcheckbox', { name: 'Number' }).click()
  await block.getByRole('textbox', { name: 'Pages' }).first().fill('412')
  await block.getByRole('textbox', { name: 'Pages' }).first().press('Enter')
  await block.getByRole('textbox', { name: 'Pages' }).nth(1).fill('204')
  await block.getByRole('textbox', { name: 'Pages' }).nth(1).press('Enter')

  await expect
    .poll(async () => {
      const database = await api<Database>(request, 'GET', `/databases/${id}`)
      const [name, pages] = database.columns
      return {
        columns: database.columns.map((c) => `${c.name}:${c.type}`),
        rows: database.rows.map((row) => [row.cells[name!.id], row.cells[pages!.id]]),
      }
    })
    .toEqual({
      columns: ['Name:text', 'Pages:number'],
      rows: [
        ['Dune', 412],
        ['Solaris', 204],
      ],
    })
  // The note itself didn't change.
  expect(await noteContent(request, note.id)).toBe(content)

  // Sorted from the column's menu, then filtered: saved with the database.
  await block.getByRole('button', { name: 'Pages' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Sort ascending' }).click()
  await expect(block.getByRole('textbox', { name: 'Name' }).first()).toHaveValue('Solaris')
  await block.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('button', { name: 'Add a filter' }).click()
  const value = page.getByTestId('database-filters').getByRole('textbox', { name: 'Value' })
  await value.fill('dun')
  await value.press('Enter')
  await page.keyboard.press('Escape')
  await expect(block.getByTestId('database-row')).toHaveCount(1)
  await expect(block.getByText('1 hidden by the filters')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('database').getByTestId('database-row')).toHaveCount(1)

  // Listed in the side panel.
  await page.getByRole('tab', { name: 'Databases' }).click()
  await expect(page.getByRole('button', { name: /Reading list\s*2 rows/ })).toBeVisible()
})

test('shows changes made by agents at once', async ({ page, request }) => {
  const note = await createNote(request, 'Agent table', 'Intro')
  const database = await api<Database>(request, 'POST', `/notes/${note.id}/databases`, {
    title: 'Tasks',
    columns: [
      { name: 'Task', type: 'text' },
      { name: 'Done', type: 'checkbox' },
    ],
  })
  await api(request, 'POST', `/notes/${note.id}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  await openNote(page, note.id)
  const block = page.getByTestId('database')
  await expect(block.getByTestId('database-row')).toHaveCount(1)
  const [task, done] = database.columns
  await api(
    request,
    'POST',
    `/databases/${database.id}/rows`,
    { cells: { [task!.id]: 'Write the report', [done!.id]: true } },
    'claude',
  )
  await expect(block.getByTestId('database-row')).toHaveCount(2)
  await expect(block.getByRole('textbox', { name: 'Task' }).nth(1)).toHaveValue('Write the report')
  await expect(block.getByRole('checkbox', { name: 'Done' }).nth(1)).toBeChecked()

  // Typing in a cell while an agent changes the table: what is typed stays.
  const cell = block.getByRole('textbox', { name: 'Task' }).first()
  await cell.click()
  await page.keyboard.type('Call ')
  await api(request, 'POST', `/databases/${database.id}/rows`, {}, 'claude')
  await expect(block.getByTestId('database-row')).toHaveCount(3)
  await page.keyboard.type('the bank')
  await expect(cell).toHaveValue('Call the bank')
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => {
      const latest = await api<Database>(request, 'GET', `/databases/${database.id}`)
      return latest.rows[0]!.cells[task!.id]
    })
    .toBe('Call the bank')
})

test('says when a database no longer exists', async ({ page, request }) => {
  const note = await createNote(request, 'Lost table', '```database\nid: nothing-here\n```')
  await openNote(page, note.id)
  await expect(page.getByText("This database doesn't exist anymore.")).toBeVisible()
})

test('picks dates with a calendar or types them, and filters on them', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Dated table', 'Intro')
  const database = await api<Database>(request, 'POST', `/notes/${note.id}/databases`, {
    columns: [
      { name: 'Task', type: 'text' },
      { name: 'Due', type: 'date' },
    ],
  })
  const [task, due] = database.columns
  await api(request, 'PATCH', `/databases/${database.id}/rows/${database.rows[0]!.id}`, {
    cells: { [task!.id]: 'Report', [due!.id]: '2026-10-12' },
  })
  await api(request, 'POST', `/databases/${database.id}/rows`, {
    cells: { [task!.id]: 'Taxes' },
  })
  await api(request, 'POST', `/notes/${note.id}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  await openNote(page, note.id)
  const block = page.getByTestId('database')
  const dueOf = async () => {
    const latest = await api<Database>(request, 'GET', `/databases/${database.id}`)
    return latest.rows.map((row) => row.cells[due!.id] ?? null)
  }

  // Shown day first; a day picked in the calendar (it opens on the cell's month).
  await expect(block.getByTestId('database-row').first()).toContainText('12/10/2026')
  await block.getByRole('button', { name: 'Pick a date: Due' }).first().click()
  await page.getByRole('button', { name: /14 October 2026/ }).click()
  await expect.poll(dueOf).toEqual(['2026-10-14', null])
  // Working inside the block doesn't frame it (the frame is for selecting it whole).
  await expect(block).not.toHaveClass(/is-selected/)

  // Typed: day, month, year.
  const second = block.getByTestId('database-row').nth(1)
  await second.getByRole('spinbutton', { name: 'day' }).click()
  await page.keyboard.type('03112026')
  await expect.poll(dueOf).toEqual(['2026-10-14', '2026-11-03'])

  // A filter on dates: before 01/11/2026.
  await block.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('button', { name: 'Add a filter' }).click()
  const filters = page.getByTestId('database-filters')
  await filters.getByRole('combobox', { name: 'Column' }).click()
  await page.getByRole('option', { name: 'Due' }).click()
  await filters.getByRole('combobox', { name: 'Condition' }).click()
  await page.getByRole('option', { name: 'is before' }).click()
  await filters.getByRole('spinbutton', { name: 'day' }).click()
  await page.keyboard.type('01112026')
  await page.keyboard.press('Escape')
  await expect(block.getByTestId('database-row')).toHaveCount(1)
  await expect(block.getByRole('textbox', { name: 'Task' })).toHaveValue('Report')
})

test('a choice column can require a value: the first choice by default', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Statuses', 'Intro')
  const database = await api<Database>(request, 'POST', `/notes/${note.id}/databases`, {
    columns: [
      { name: 'Task', type: 'text' },
      { name: 'Status', type: 'select', options: ['To do', 'Done'] },
    ],
  })
  await api(request, 'POST', `/notes/${note.id}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  await openNote(page, note.id)
  const block = page.getByTestId('database')
  const status = block.getByRole('combobox', { name: 'Status' }).first()
  await expect(status).toHaveText('—')

  await block.getByRole('button', { name: 'Status' }).click()
  await page.getByRole('menuitem', { name: 'Edit choices…' }).click()
  const dialog = page.getByRole('dialog')
  const allowEmpty = dialog.getByRole('checkbox', { name: 'Allow empty' })
  await expect(allowEmpty).toBeChecked()
  await allowEmpty.click()
  await expect(dialog).toContainText('new rows start with the first one')
  await dialog.getByRole('button', { name: 'Save' }).click()

  // The empty cell took the first choice, which can't be emptied any more; new rows start with it.
  await expect(status).toHaveText('To do')
  await status.click()
  await expect(page.getByRole('option')).toHaveText(['To do', 'Done'])
  await page.getByRole('option', { name: 'Done' }).click()
  await expect(status).toHaveText('Done')
  await block.getByRole('button', { name: 'New row' }).click()
  await expect(block.getByRole('combobox', { name: 'Status' }).nth(1)).toHaveText('To do')
})

test('choices are edited one per line, each with a color (none by default)', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Colors', 'Intro')
  const database = await api<Database>(request, 'POST', `/notes/${note.id}/databases`, {
    columns: [{ name: 'Status', type: 'select', options: ['To do', 'Done'] }],
  })
  await api(request, 'POST', `/notes/${note.id}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  await openNote(page, note.id)
  const block = page.getByTestId('database')

  await block.getByRole('button', { name: 'Status' }).click()
  await page.getByRole('menuitem', { name: 'Edit choices…' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox', { name: 'Choice 1' })).toHaveValue('To do')
  await expect(dialog.getByRole('button', { name: 'Color of Done: none' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Color of Done: none' }).click()
  await page.getByRole('option', { name: 'Green' }).click()
  // Enter adds a choice after the one typed in; a renamed choice keeps its color.
  await dialog.getByRole('textbox', { name: 'Choice 2' }).fill('Finished')
  await dialog.getByRole('textbox', { name: 'Choice 2' }).press('Enter')
  await expect(dialog.getByRole('textbox', { name: 'Choice 3' })).toBeFocused()
  await page.keyboard.type('Dropped')
  await dialog.getByRole('button', { name: 'Move Dropped up' }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect
    .poll(async () => (await api<Database>(request, 'GET', `/databases/${database.id}`)).columns[0])
    .toMatchObject({ options: ['To do', 'Dropped', 'Finished'], colors: { Finished: 'green' } })
  const status = block.getByRole('combobox', { name: 'Status' }).first()
  await status.click()
  await page.getByRole('option', { name: 'Finished' }).click()
  await expect(status.locator('span.bg-green-100')).toHaveText('Finished')
})

test('text cells take several lines: Shift+Enter starts one, Enter saves', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Long texts', 'Intro')
  const database = await api<Database>(request, 'POST', `/notes/${note.id}/databases`, {
    columns: [{ name: 'Task', type: 'text' }],
  })
  await api(request, 'POST', `/notes/${note.id}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  await openNote(page, note.id)
  const cell = page.getByTestId('database').getByRole('textbox', { name: 'Task' })
  const before = (await cell.boundingBox())!.height
  await cell.click()
  await page.keyboard.type('Call the bank')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('before noon')
  // The cell grows with its lines.
  expect((await cell.boundingBox())!.height).toBeGreaterThan(before * 1.5)
  await page.keyboard.press('Enter')
  await expect(cell).not.toBeFocused()
  await expect
    .poll(async () => {
      const latest = await api<Database>(request, 'GET', `/databases/${database.id}`)
      return latest.rows[0]!.cells[database.columns[0]!.id]
    })
    .toBe('Call the bank\nbefore noon')
})

test('money columns show euros, with cents on every row once one amount has some', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Budget', 'Intro')
  const database = await api<Database>(request, 'POST', `/notes/${note.id}/databases`, {
    columns: [{ name: 'Price', type: 'money' }],
  })
  await api(request, 'POST', `/databases/${database.id}/rows`, {})
  await api(request, 'POST', `/notes/${note.id}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  await openNote(page, note.id)
  const cells = page.getByTestId('database').getByRole('textbox', { name: 'Price' })
  const nb = '\u202f'
  await cells.first().click()
  await page.keyboard.type('1234')
  await page.keyboard.press('Enter')
  await expect(cells.first()).toHaveValue(`1${nb}234\u00a0€`)

  // An amount with cents: every amount of the column shows them.
  await cells.nth(1).click()
  await page.keyboard.type('9,5')
  await page.keyboard.press('Enter')
  await expect(cells.nth(1)).toHaveValue('9,50\u00a0€')
  await expect(cells.first()).toHaveValue(`1${nb}234,00\u00a0€`)

  // None left: whole euros again.
  await cells.nth(1).fill('10')
  await page.keyboard.press('Enter')
  await expect(cells.first()).toHaveValue(`1${nb}234\u00a0€`)
  await expect(cells.nth(1)).toHaveValue('10\u00a0€')
})

test('columns are resized from their edge; a wide database makes the page full width', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Wide table', 'Intro')
  const database = await api<Database>(request, 'POST', `/notes/${note.id}/databases`, {
    columns: [
      { name: 'Task', type: 'text' },
      { name: 'Points', type: 'number' },
    ],
  })
  await api(request, 'POST', `/notes/${note.id}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  await page.setViewportSize({ width: 1600, height: 900 })
  await openNote(page, note.id)
  const block = page.getByTestId('database')
  const notePage = block.locator('xpath=ancestor::div[contains(@class, "mx-auto")][1]')
  const widthOf = async () => {
    const latest = await api<Database>(request, 'GET', `/databases/${database.id}`)
    return latest.columns[0]!.width ?? null
  }

  // Two columns fit in the text.
  await expect(notePage).not.toHaveAttribute('style', /max-width: 100%/)

  // Dragged wider: saved, and wider than the text, so the page goes full width.
  const edge = block.getByRole('separator', { name: 'Resize Task' })
  const box = (await edge.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 700, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(widthOf).toBeGreaterThan(900)
  await expect(notePage).toHaveAttribute('style', /max-width: 100%/)

  // A double-click on the edge: back to the default width, and to the text's width.
  await edge.dblclick()
  await expect.poll(widthOf).toBeNull()
  await expect(notePage).not.toHaveAttribute('style', /max-width: 100%/)
})

test("filters from a column's menu: the filters open on a new condition for it", async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Column filter', 'Intro')
  const database = await api<Database>(request, 'POST', `/notes/${note.id}/databases`, {
    columns: [
      { name: 'Task', type: 'text' },
      { name: 'Points', type: 'number' },
    ],
  })
  const [task, points] = database.columns
  await api(request, 'PATCH', `/databases/${database.id}/rows/${database.rows[0]!.id}`, {
    cells: { [task!.id]: 'Small', [points!.id]: 1 },
  })
  await api(request, 'POST', `/databases/${database.id}/rows`, {
    cells: { [task!.id]: 'Big', [points!.id]: 8 },
  })
  await api(request, 'POST', `/notes/${note.id}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  await openNote(page, note.id)
  const block = page.getByTestId('database')
  await block.getByRole('button', { name: 'Points' }).click()
  await page.getByRole('menuitem', { name: 'Filter' }).click()

  const filters = page.getByTestId('database-filters')
  await expect(filters).toBeVisible()
  await expect(filters.getByRole('combobox', { name: 'Column' })).toContainText('Points')
  // Still open a moment later, and no row hidden while the condition has no value.
  await page.waitForTimeout(500)
  await expect(filters).toBeVisible()
  await expect(block.getByTestId('database-row')).toHaveCount(2)
  await filters.getByRole('combobox', { name: 'Condition' }).click()
  await page.getByRole('option', { name: '>' }).click()
  const value = filters.getByRole('textbox', { name: 'Value' })
  await value.fill('5')
  await value.press('Enter')
  await expect(block.getByTestId('database-row')).toHaveCount(1)
  await expect(block.getByRole('textbox', { name: 'Task' })).toHaveValue('Big')
})

test('inserts rows below another (its + or ⌘Enter) and moves them with ⌥↑ / ⌥↓', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Ordered table', 'Intro')
  const database = await api<Database>(request, 'POST', `/notes/${note.id}/databases`, {
    columns: [{ name: 'Task', type: 'text' }],
  })
  const [task] = database.columns
  await api(request, 'PATCH', `/databases/${database.id}/rows/${database.rows[0]!.id}`, {
    cells: { [task!.id]: 'A' },
  })
  for (const name of ['B', 'C']) {
    await api(request, 'POST', `/databases/${database.id}/rows`, { cells: { [task!.id]: name } })
  }
  await api(request, 'POST', `/notes/${note.id}/append`, {
    content: `\`\`\`database\nid: ${database.id}\n\`\`\``,
  })
  await openNote(page, note.id)
  const block = page.getByTestId('database')
  const cells = block.getByRole('textbox', { name: 'Task' })
  const order = async () => {
    const latest = await api<Database>(request, 'GET', `/databases/${database.id}`)
    return latest.rows.map((row) => row.cells[task!.id] ?? null)
  }
  await expect(cells).toHaveCount(3)

  // The row's +: a row right below it, the cursor in it.
  await block.getByTestId('database-row').first().hover()
  await block.getByRole('button', { name: 'Insert a row below' }).first().click()
  await expect(cells.nth(1)).toBeFocused()
  await page.keyboard.type('A2')
  // ⌘Enter: the value is saved, and another row comes below.
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(cells.nth(2)).toBeFocused()
  await page.keyboard.type('A3')
  await page.keyboard.press('Enter')
  await expect.poll(order).toEqual(['A', 'A2', 'A3', 'B', 'C'])

  // ⌥↑ / ⌥↓ move the row; the cursor stays in it.
  await cells.nth(4).click()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(cells.nth(3)).toBeFocused()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(cells.nth(2)).toBeFocused()
  await expect(cells.nth(2)).toHaveValue('C')
  await page.keyboard.press('Alt+ArrowDown')
  await expect(cells.nth(3)).toBeFocused()
  await expect.poll(order).toEqual(['A', 'A2', 'A3', 'C', 'B'])

  // A sorted table has no order to change: it says so.
  await api(request, 'PATCH', `/databases/${database.id}`, {
    sort: { column: task!.id, direction: 'desc' },
  })
  await expect(cells.first()).toHaveValue('C')
  await cells.first().click()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(page.getByText('The table is sorted')).toBeVisible()
  await expect.poll(order).toEqual(['A', 'A2', 'A3', 'C', 'B'])
})
