// The agenda of daily notes: `/event` on an empty day, events typed on one line, checked off,
// renamed, changed in their popover (a repeating one: this day only), deleted and undone; a day
// with events but nothing written leaves no file; the side calendar marks days with events.
import { expect, test, type Page } from '@playwright/test'
import { addDays, isoDate } from '@tandem/shared'
import { api } from './helpers'

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

test('adds, checks, changes and deletes events in a day’s agenda', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { daily: true })
  // A day ahead: "all from today" keeps no past for it.
  const day = addDays(isoDate(), 2)
  await page.goto(`/daily/${day}`)
  await expect(page.getByTestId('day-title')).toBeVisible()
  // No events: nothing shows.
  await expect(page.getByTestId('agenda-event')).toHaveCount(0)

  // /event: the agenda, its add line focused; typed events show their label live.
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('/even')
  await page.getByRole('option', { name: /Event/ }).click()
  const add = page.getByTestId('agenda-add')
  await expect(add).toBeFocused()
  await add.fill('13:30-14:30 Lunch with Paul')
  await expect(page.getByTestId('agenda-draft-time')).toHaveText('13:30 → 14:30')
  await add.press('Enter')
  await add.fill('Pay rent')
  await add.press('Enter')
  const events = page.getByTestId('agenda-event')
  // All day first.
  await expect.poll(() => lines(page)).toEqual(['day Pay rent', '13:30 → 14:30 Lunch with Paul'])
  await expect(page.locator(`[data-date="${day}"] [data-testid="calendar-events"]`)).toBeVisible()

  // Checked off: struck through, and kept.
  await events.first().getByRole('checkbox').click()
  await expect(events.first().getByTestId('agenda-title')).toHaveClass(/line-through/)

  // Renamed in place.
  const title = events.nth(1).getByTestId('agenda-title')
  await title.fill('Lunch with Marie')
  await title.press('Enter')
  await expect
    .poll(async () => (await api<Event[]>(request, 'GET', '/agenda/events')).map((e) => e.title))
    .toContain('Lunch with Marie')

  // A repeating event, changed on this day only.
  await api(request, 'POST', '/agenda/events', {
    title: 'Standup',
    date: day,
    start: '09:00',
    repeat: 'daily',
  })
  await expect(events).toHaveCount(3)
  await events.nth(1).getByTestId('agenda-time').click()
  const form = page.getByTestId('agenda-event-form')
  await form.getByRole('button', { name: 'All day' }).click()
  await form.getByRole('button', { name: 'Save' }).click()
  await page.getByTestId('scope-one').click()
  await expect
    .poll(() => lines(page))
    .toEqual(['day Pay rent', 'day Standup', '13:30 → 14:30 Lunch with Marie'])
  const next = await api<{ title: string; start: string | null }[]>(
    request,
    'GET',
    `/agenda?from=${addDays(day, 1)}`,
  )
  expect(next).toMatchObject([{ title: 'Standup', start: '09:00' }])

  // Deleted, then brought back.
  await events.first().getByTestId('agenda-time').click()
  await form.getByRole('button', { name: 'Delete' }).click()
  await expect(events).toHaveCount(2)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(events).toHaveCount(3)
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
  await expect(page.getByText(/Added to Today/)).toBeVisible()
  expect(await api<Event[]>(request, 'GET', '/agenda/events')).toMatchObject([
    { title: 'Run', start: '08:00' },
  ])
})
