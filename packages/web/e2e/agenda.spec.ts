// The agenda of daily notes: `/event` on an empty day, events typed on one line, checked off,
// renamed, changed in their popover (a repeating one: this day only), deleted and undone; a day
// with events but nothing written leaves no file; the side calendar marks days with events.
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

test('types events anywhere in a day’s note, checks, changes and deletes them', async ({
  page,
  request,
}) => {
  await api(request, 'PATCH', '/settings', { daily: true })
  // A day ahead: "all from today" keeps no past for it.
  const day = addDays(isoDate(), 2)
  await page.goto(`/daily/${day}`)
  await expect(page.getByTestId('day-title')).toBeVisible()
  // No events: nothing shows.
  await expect(page.getByTestId('agenda-event')).toHaveCount(0)

  // A line of text, then a time and a space at the start of a line: an event being typed, the
  // time becoming its label once the title begins.
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Morning notes')
  await page.keyboard.press('Enter')
  await page.keyboard.type('13:30 ')
  const draft = page.getByTestId('event-draft')
  await expect(draft).toBeFocused()
  await draft.pressSequentially('- 14:30 Lunch with Paul')
  await expect(page.getByTestId('event-draft-time')).toHaveText('13:30 → 14:30')
  await expect(draft).toHaveValue('Lunch with Paul')
  // Enter saves it and goes on to a new line, for text or the next event.
  await draft.press('Enter')
  await page.keyboard.type('Then the afternoon')
  await page.keyboard.press('Enter')
  // `/event` starts one with no time: all day. A time alone then Tab makes it the label, and
  // Backspace at the start puts it back.
  await page.keyboard.type('/even')
  await page.getByRole('option', { name: /Event/ }).click()
  await expect(draft).toBeFocused()
  await draft.pressSequentially('9h')
  await draft.press('Tab')
  await expect(page.getByTestId('event-draft-time')).toHaveText('09:00')
  await draft.press('Backspace')
  await expect(draft).toHaveValue('09:00')
  await draft.fill('')
  await draft.pressSequentially('Pay rent')
  await draft.press('Enter')
  // Where they were typed, between the text.
  await expect.poll(() => lines(page)).toEqual(['13:30 → 14:30 Lunch with Paul', 'day Pay rent'])
  await expect(page.locator('.ProseMirror')).toContainText('Then the afternoon')
  await expect(page.locator(`[data-date="${day}"] [data-testid="calendar-events"]`)).toBeVisible()
  const events = page.getByTestId('agenda-event')

  // Checked off: struck through.
  await events.nth(1).getByRole('checkbox').click()
  await expect(events.nth(1).getByTestId('agenda-title')).toHaveClass(/line-through/)
  // A click at the end of the line, past the title, puts the cursor in it; renamed in place,
  // Enter goes on to a new line below, as a to-do's.
  const title = events.first().getByTestId('agenda-title')
  const line = await events.first().boundingBox()
  await page.mouse.click(line!.x + line!.width - 40, line!.y + line!.height / 2)
  await expect(title).toBeFocused()
  await title.fill('Lunch with Marie')
  await title.press('Enter')
  await page.keyboard.type('Notes about lunch')
  await expect
    .poll(async () => (await api<Event[]>(request, 'GET', '/agenda/events')).map((e) => e.title))
    .toContain('Lunch with Marie')
  await expect(page.locator('.ProseMirror p', { hasText: 'Notes about lunch' })).toBeVisible()

  // An event added elsewhere (a repeating one): in the agenda block, at the top.
  await api(request, 'POST', '/agenda/events', {
    title: 'Standup',
    date: day,
    start: '09:00',
    repeat: 'daily',
  })
  const agenda = page.getByTestId('agenda')
  await expect(agenda.getByTestId('agenda-event')).toHaveCount(1)
  // Changed on this day only: still in the agenda.
  await agenda.getByTestId('agenda-time').click()
  const form = page.getByTestId('agenda-event-form')
  await form.getByRole('button', { name: 'All day' }).click()
  await form.getByRole('button', { name: 'Save' }).click()
  await page.getByTestId('scope-one').click()
  await expect(agenda).toContainText('day')
  const next = await api<{ title: string; start: string | null }[]>(
    request,
    'GET',
    `/agenda?from=${addDays(day, 1)}`,
  )
  expect(next).toMatchObject([{ title: 'Standup', start: '09:00' }])
  // Dragged into the note: placed there, the agenda empty.
  await agenda.hover()
  await agenda
    .getByTestId('agenda-grip')
    .dragTo(page.locator('.ProseMirror p', { hasText: 'Then the afternoon' }))
  await expect(agenda.getByTestId('agenda-event')).toHaveCount(0)
  await expect(page.getByTestId('event-block')).toHaveCount(3)

  // Deleted from its details: its line goes; Undo brings the event back (in the agenda).
  await events.first().getByTestId('agenda-time').click()
  await form.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('event-block')).toHaveCount(2)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(agenda.getByTestId('agenda-event')).toHaveCount(1)

  // The note names its placed events.
  await waitSaved(page)
  const note = await api<Node>(request, 'GET', `/resolve?ref=Calendar/${day}`)
  expect((await noteContent(request, note.id)).match(/```event\nid: /g)).toHaveLength(2)
})

test('makes an empty to-do an event, in its list', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { daily: true })
  const day = addDays(isoDate(), 4)
  await page.goto(`/daily/${day}`)
  await expect(page.getByTestId('day-title')).toBeVisible()
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('[ ] Hello')
  await page.keyboard.press('Enter')
  // The empty to-do takes the event, its checkbox there at once.
  await page.keyboard.type('14h ')
  const draft = page.getByTestId('event-draft')
  await expect(draft).toBeFocused()
  await expect(page.getByTestId('event-block').locator('input[type="checkbox"]')).toBeVisible()
  await draft.pressSequentially('Call')
  // Enter: on to a new to-do below, as in the list.
  await draft.press('Enter')
  await page.keyboard.type('Buy milk')
  await expect.poll(() => lines(page)).toEqual(['14:00 Call'])
  await expect(page.locator('.ProseMirror li', { hasText: 'Buy milk' })).toBeVisible()
  // `/event` in an empty to-do takes it too; Escape makes it a to-do again, in its list.
  await page.keyboard.press('Enter')
  await page.keyboard.type('/even')
  await page.getByRole('option', { name: /Event/ }).click()
  await expect(draft).toBeFocused()
  await draft.pressSequentially('Later')
  await draft.press('Escape')
  await expect(page.locator('.ProseMirror li', { hasText: 'Later' })).toBeVisible()
  await waitSaved(page)
  const note = await api<Node>(request, 'GET', `/resolve?ref=Calendar/${day}`)
  expect(await noteContent(request, note.id)).toMatch(
    /^- \[ \] Hello\n\n```event\nid: \w+\n```\n\n- \[ \] Buy milk\n- \[ \] Later\n/m,
  )
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
