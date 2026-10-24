// The agenda above a daily note: `/event` on an empty day, events typed on one line, in the
// day's order, checked off, renamed, changed in their popover (a repeating one: this day only),
// deleted and undone, the note's text a note as any; a day with events but nothing written
// leaves no file; the side calendar marks days with events.
import { expect, test, type Page } from '@playwright/test'
import { addDays, isoDate } from '@tandem/shared'
import { api, noteContent, waitSaved } from './helpers'

interface Node {
  id: string
  path: string
}
interface Event {
  id: string
  title: string
  start: string | null
  repeat: string | null
}

/** The agenda's lines as they read: the time label, then the title (an input). */
function lines(page: Page) {
  return page
    .getByTestId('agenda-event')
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          `${row.querySelector('[data-testid="agenda-time"]')?.textContent?.trim()} ${(row.querySelector('[data-testid="agenda-title"]') as HTMLInputElement).value}`,
      ),
    )
}

test.afterEach(async ({ request }) => {
  // Deleting a repeating event deletes the days taken out of it: some are gone already.
  for (const event of await api<Event[]>(request, 'GET', '/agenda/events')) {
    await request.delete(`/api/agenda/events/${event.id}`)
  }
  await api(request, 'PATCH', '/settings', { daily: false })
  const calendar = (await api<Node[]>(request, 'GET', '/tree')).find((n) => n.path === 'Calendar')
  if (calendar) await api(request, 'DELETE', `/nodes/${calendar.id}`)
})

test('adds, checks, changes and deletes events in the agenda above a day’s note', async ({
  page,
  request,
}) => {
  await api(request, 'PATCH', '/settings', { daily: true })
  // A day ahead: "all from today" keeps no past for it.
  const day = addDays(isoDate(), 2)
  await page.goto(`/daily/${day}`)
  await expect(page.getByTestId('day-title')).toBeVisible()
  // No events: no agenda.
  await expect(page.getByTestId('agenda')).toHaveCount(0)

  // `/event`: the agenda, its add line focused. The time typed becomes the label.
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('/even')
  await page.getByRole('option', { name: /Event/ }).click()
  const add = page.getByTestId('agenda-add')
  await expect(add).toBeFocused()
  await add.pressSequentially('13:30 - 14:30 Lunch with Paul')
  await expect(page.getByTestId('agenda-draft-time')).toHaveText('13:30 → 14:30')
  await expect(add).toHaveValue('Lunch with Paul')
  await add.press('Enter')
  // A time alone then Tab; Backspace at the start puts it back.
  await add.pressSequentially('9h')
  await add.press('Tab')
  await expect(page.getByTestId('agenda-draft-time')).toHaveText('09:00')
  await add.press('Backspace')
  await expect(add).toHaveValue('09:00')
  await add.fill('')
  await add.pressSequentially('Pay rent')
  await add.press('Enter')
  await add.pressSequentially('8h Gym')
  await add.press('Enter')
  // In the day's order: all day first, then by time.
  await expect
    .poll(() => lines(page))
    .toEqual(['day Pay rent', '08:00 Gym', '13:30 → 14:30 Lunch with Paul'])
  // Escape closes the new line; the + opens it again, with its checkbox.
  await add.press('Escape')
  await expect(add).toHaveCount(0)
  await page.getByTestId('agenda-new').click()
  await expect(add).toBeFocused()
  await expect(add).toHaveAttribute('placeholder', '14h Standup')
  await add.press('Escape')
  await expect(page.locator(`[data-date="${day}"] [data-testid="calendar-events"]`)).toBeVisible()
  const events = page.getByTestId('agenda-event')

  // The note's text, below, is a note as any: to-dos and all.
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('[ ] Call the bank')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Buy milk')
  await expect(page.locator('.ProseMirror li')).toHaveCount(2)

  // Checked off: struck through. A click at the end of a line edits its title.
  await events.first().getByRole('checkbox').check()
  await expect(events.first().getByTestId('agenda-title')).toHaveClass(/line-through/)
  const title = events.nth(2).getByTestId('agenda-title')
  const line = await events.nth(2).boundingBox()
  await page.mouse.click(line!.x + line!.width - 60, line!.y + line!.height / 2)
  await expect(title).toBeFocused()
  await title.fill('Lunch with Marie')
  await title.press('Enter')
  await expect
    .poll(async () => (await api<Event[]>(request, 'GET', '/agenda/events')).map((e) => e.title))
    .toContain('Lunch with Marie')

  // A repeating event, changed on this day only, in its place by time.
  await api(request, 'POST', '/agenda/events', {
    title: 'Standup',
    date: day,
    start: '09:00',
    repeat: 'daily',
  })
  await expect(events).toHaveCount(4)
  await events.nth(2).getByTestId('agenda-time').click()
  const form = page.getByTestId('agenda-event-form')
  await form.getByRole('button', { name: 'All day' }).click()
  await form.getByRole('button', { name: 'Save' }).click()
  await page.getByTestId('scope-one').click()
  await expect
    .poll(() => lines(page))
    .toEqual(['day Pay rent', 'day Standup', '08:00 Gym', '13:30 → 14:30 Lunch with Marie'])
  const next = await api<{ title: string; start: string | null }[]>(
    request,
    'GET',
    `/agenda?from=${addDays(day, 1)}`,
  )
  expect(next).toMatchObject([{ title: 'Standup', start: '09:00' }])

  // Deleted with its button, then brought back; from its details too.
  await events.nth(2).hover()
  await events.nth(2).getByTestId('agenda-delete').click()
  await expect(events).toHaveCount(3)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(events).toHaveCount(4)
  await events.nth(2).getByTestId('agenda-time').click()
  await form.getByRole('button', { name: 'Delete' }).click()
  await expect(events).toHaveCount(3)

  // Nothing of the agenda in the note's file.
  await waitSaved(page)
  const note = await api<Node>(request, 'GET', `/resolve?ref=Calendar/${day}`)
  const content = await noteContent(request, note.id)
  expect(content).toContain('- [ ] Call the bank')
  expect(content).not.toContain('```')

  // The last event deleted: no agenda.
  for (let count = 3; count > 0; count--) {
    await events.first().hover()
    await events.first().getByTestId('agenda-delete').click()
    if (count > 1) await expect(events).toHaveCount(count - 1)
  }
  await expect(page.getByTestId('agenda')).toHaveCount(0)
})

test('shows a day’s events without writing its file', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { daily: true })
  const day = addDays(isoDate(), 3)
  await api(request, 'POST', '/agenda/events', { title: 'Dentist', date: day, start: '10:00' })
  await page.goto(`/daily/${day}`)
  await expect.poll(() => lines(page)).toEqual(['10:00 Dentist'])
  // Left with nothing written: no file, the event still there.
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect
    .poll(async () =>
      (await api<Node[]>(request, 'GET', '/tree')).some((n) => n.path === `Calendar/${day}.md`),
    )
    .toBe(false)
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByTestId('agenda-event')).toHaveCount(1)
})

test('drops the blocks of the earlier agenda from a day’s note', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { daily: true })
  const day = addDays(isoDate(), 5)
  const node = await api<Node>(request, 'POST', `/calendar/${day}`)
  await api(request, 'PUT', `/notes/${node.id}/content`, {
    content: '```agenda\n```\n\nNotes.\n\n```event\nid: Kx3fq9P2mZ0a\n```\n',
  })
  await page.goto(`/notes/${node.id}`)
  await expect(page.locator('.ProseMirror')).toContainText('Notes.')
  await expect.poll(() => noteContent(request, node.id)).toBe('Notes.\n')
})

test('adds an event from the palette', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { daily: true })
  await page.goto('/')
  await page
    .getByRole('button', { name: /Search/ })
    .first()
    .click()
  await page.getByPlaceholder(/Search notes/).fill('New event')
  await page.getByRole('option', { name: /New event/ }).click()
  await page.getByTestId('new-event').fill('8h Run')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  // The toast's title (its live region repeats it for screen readers).
  await expect(page.locator('[data-slot="title"]', { hasText: 'Added to Today' })).toBeVisible()
  expect(await api<Event[]>(request, 'GET', '/agenda/events')).toMatchObject([
    { title: 'Run', start: '08:00' },
  ])
})
