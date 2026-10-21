// Daily notes (calendar notes): one note per day, `Calendar/2026-10-21.md` in the notes folder.
// They are notes like any other (history, links, search, agents), reached by their date rather
// than from the tree, which doesn't show them while daily notes are on. Dates are ISO
// (`YYYY-MM-DD`), in the computer's time zone: the app and the server run on the same computer.

export const CALENDAR_DIR = 'Calendar'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
// Any case: a Mac's disk ignores it, so `calendar/` is the same folder.
const DAY_PATH = new RegExp(`^${CALENDAR_DIR}/(\\d{4}-\\d{2}-\\d{2})\\.md$`, 'i')

/** A real day written `YYYY-MM-DD` (`2026-02-30` isn't one). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, year, month, day] = match.map(Number) as [number, number, number, number]
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** The day of `date` (today by default), in the computer's time zone. */
export function isoDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The local midnight of an ISO day. */
export function dateOf(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

/** The day `days` after (or before) an ISO day. */
export function addDays(iso: string, days: number): string {
  const date = dateOf(iso)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

/** The file of a day's note. */
export function calendarPath(iso: string): string {
  return `${CALENDAR_DIR}/${iso}.md`
}

/** The day of a calendar note's path, or null for any other note. */
export function calendarDateOf(path: string): string | null {
  const day = DAY_PATH.exec(path)?.[1]
  return day && isIsoDate(day) ? day : null
}

/** The ISO week number (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
  // In UTC: a daylight saving change can't shift a day.
  const date = new Date(Date.UTC(year, month - 1, day))
  // The Thursday of this week decides the year the week belongs to.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1)
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** `October 2026` */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`
}

/**
 * How a day reads: the day before the month, as in French (`Wednesday 21 October`; the year
 * when it isn't this one), led by Today, Yesterday or Tomorrow. `short` is for tabs.
 */
export function dayLabel(iso: string, today = isoDate()): { title: string; short: string } {
  const date = dateOf(iso)
  const weekday = WEEKDAYS[date.getDay()]!
  const month = MONTHS[date.getMonth()]!
  const year = date.getFullYear() === dateOf(today).getFullYear() ? '' : ` ${date.getFullYear()}`
  const long = `${weekday} ${date.getDate()} ${month}${year}`
  const relative =
    iso === today
      ? 'Today'
      : iso === addDays(today, -1)
        ? 'Yesterday'
        : iso === addDays(today, 1)
          ? 'Tomorrow'
          : null
  return {
    title: relative ? `${relative}, ${long}` : long,
    short: relative ?? `${weekday.slice(0, 3)} ${date.getDate()} ${month.slice(0, 3)}${year}`,
  }
}

/** A day of the calendar, as the server sums it up for its marks. */
export interface CalendarDay {
  date: string
  id: string
  /** Something is written in it. */
  written: boolean
  /** Its to-dos (`- [ ]`) left, and done (`- [x]`). */
  open: number
  done: number
}

const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/gm

/** The to-dos of a Markdown note, left and done. */
export function taskCounts(markdown: string): { open: number; done: number } {
  let open = 0
  let done = 0
  for (const match of markdown.matchAll(TASK)) {
    if (match[1] === ' ') open++
    else done++
  }
  return { open, done }
}
