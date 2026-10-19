// Databases: inserted from the slash menu, edited in place, sorted and filtered, listed in the
// side panel; their data in Tandem, only their block in the note.
import { expect, test } from '@playwright/test'
import type { Editor } from '@tiptap/core'
import { api, createNote, noteContent, openNote, waitSaved } from './helpers'

interface Database {
  id: string
  columns: { id: string; name: string; type: string }[]
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
