// Daily notes: Daily in the sidebar, the day as the title, the side panel's calendar, ‹ › days,
// and no file for a day left empty.
import { expect, test } from '@playwright/test'
import { addDays, dayLabel, isoDate } from '@tandem/shared'
import { api, waitSaved } from './helpers'

interface Node {
  id: string
  path: string
}

test.afterEach(async ({ request }) => {
  await api(request, 'PATCH', '/settings', { daily: false })
  // Other tests read the tree: the Calendar folder goes, with its days.
  const calendar = (await api<Node[]>(request, 'GET', '/tree')).find((n) => n.path === 'Calendar')
  if (calendar) await api(request, 'DELETE', `/nodes/${calendar.id}`)
})

test('opens today’s note from the sidebar, out of the tree, with a calendar', async ({
  page,
  request,
}) => {
  await api(request, 'PATCH', '/settings', { daily: true })
  const today = isoDate()
  const tomorrow = addDays(today, 1)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Calendar notes' }).getByText('Today').click()
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(today).title)
  await expect(page.getByTestId('tab-Today')).toBeVisible()
  await expect(page.getByTestId('tree-Calendar')).toHaveCount(0)
  await expect(page.getByTestId(`tree-${today}`)).toHaveCount(0)

  // The side panel shows the calendar by itself, on today.
  const calendar = page.getByTestId('side-calendar')
  await expect(calendar).toBeVisible()
  await expect(calendar.locator('[aria-current="date"]')).toHaveAttribute('data-date', today)
  // The browsing keys under it: in a browser tab, ⌃⌥ and the arrows (⌥⌘← ⌥⌘→ switch its
  // tabs; features.spec shows them in the app's window).
  const calendarKeys = calendar.getByTestId('calendar-keys')
  await expect(calendarKeys).toContainText('Navigate days and weeks')
  // One line: ⌃ ⌥ and one chip for any arrow.
  await expect(calendarKeys.locator('kbd')).toHaveCount(3)
  await expect(calendarKeys.getByLabel('Any arrow key')).toHaveCount(1)

  // Written, with a to-do left: marked in the calendar.
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('[ ] Call the notary')
  await waitSaved(page)
  await expect(calendar.locator(`[data-date="${today}"]`)).toHaveAttribute(
    'aria-label',
    /written, to-dos left/,
  )
  const file = await api<Node>(request, 'GET', `/resolve?ref=Calendar/${today}`)
  expect(file.path).toBe(`Calendar/${today}.md`)

  // ‹ › go from day to day; tomorrow, left empty, leaves no note.
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(tomorrow).title)
  await page.getByRole('button', { name: 'Today', exact: true }).first().click()
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(today).title)
  await expect
    .poll(async () =>
      (await api<{ date: string }[]>(request, 'GET', `/calendar?month=${tomorrow.slice(0, 7)}`))
        .map((day) => day.date)
        .includes(tomorrow),
    )
    .toBe(false)

  // A click on a day opens it.
  await calendar.locator(`[data-date="${tomorrow}"]`).click()
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(tomorrow).title)

  // ⌥⌘← ⌥⌘→ go from day to day, ⌘T back to today, ⌥⌘↑ ⌥⌘↓ by weeks, all in the same tab.
  const tabCount = await page.getByRole('tab').count()
  await page.keyboard.press('ControlOrMeta+Alt+ArrowRight')
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(addDays(today, 2)).title)
  await page.keyboard.press('ControlOrMeta+Alt+ArrowLeft')
  await page.keyboard.press('ControlOrMeta+Alt+ArrowLeft')
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(today).title)
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(addDays(today, -1)).title)
  await page.keyboard.press('ControlOrMeta+T')
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(today).title)
  // ⌥⌘↓ ⌥⌘↑: a week later or earlier, in the same tab too.
  await page.keyboard.press('ControlOrMeta+Alt+ArrowDown')
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(addDays(today, 7)).title)
  await page.keyboard.press('ControlOrMeta+Alt+ArrowUp')
  await page.keyboard.press('ControlOrMeta+Alt+ArrowUp')
  await expect(page.getByTestId('day-title')).toHaveText(dayLabel(addDays(today, -7)).title)
  expect(await page.getByRole('tab').count()).toBe(tabCount)

  // Off, daily notes are pages like any other, in Calendar.
  await api(request, 'PATCH', '/settings', { daily: false })
  await page.reload()
  await expect(page.getByTestId('tree-Calendar')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Calendar notes' })).toHaveCount(0)
})
