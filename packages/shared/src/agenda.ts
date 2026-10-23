// The agenda of daily notes: events kept in Tandem (SQLite), shown in a day's note by an
// `agenda` block, and read-only events from calendar feeds (`.ics` addresses). The block holds
// no data: it shows the events of its note's day. Times are the computer's, as days are.
//
// Repeats are a few presets, expanded here for the days asked for (never stored one by one): an
// event that repeats forever has no row, file or note for 2099.
import type { ChoiceColor } from './databases.ts'
import { addDays, dateOf, isIsoDate } from './calendar.ts'

/** The block that shows a day's agenda in its note. */
export const AGENDA_BLOCK = '```agenda\n```'

const AGENDA_FENCE = /^```agenda[ \t]*\n(?:[^\n]*\n)*?```[ \t]*$/gm

/** Whether a note's Markdown has an agenda block. */
export function hasAgendaBlock(markdown: string): boolean {
  return new RegExp(AGENDA_FENCE.source, 'm').test(markdown)
}

/** The Markdown without its agenda blocks: a day's note holding only one is empty. */
export function withoutAgenda(markdown: string): string {
  return markdown.replace(AGENDA_FENCE, '')
}

export const REPEATS = ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'] as const
export type Repeat = (typeof REPEATS)[number]

export const REPEAT_LABELS: Record<Repeat, string> = {
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  yearly: 'Every year',
}

export const EVENT_TITLE_MAX = 200

/** An event of Tandem's own agenda. */
export interface AgendaEvent {
  id: string
  title: string
  /** Its day (`YYYY-MM-DD`); a repeating event's first one. */
  date: string
  /** `HH:MM`, or null for all day. */
  start: string | null
  /** `HH:MM` (with a start only), or null. */
  end: string | null
  repeat: Repeat | null
  /** The last day it repeats, or null for ever. */
  until: string | null
  /** Days left out of the repeat (deleted or changed alone). */
  skipped: string[]
  /** For one day changed alone: the event it was taken out of. */
  seriesId: string | null
  createdAt: number
  updatedAt: number
}

/** A calendar feed: an `.ics` address read now and then, its events read-only. */
export interface AgendaFeed {
  id: string
  name: string
  url: string
  color: ChoiceColor
  /** When it was last read successfully, or null. */
  fetchedAt: number | null
  /** Why the last reading failed, or null. */
  error: string | null
  /** How many events (repeating ones once) it had then. */
  events: number
}

/** What undoes a change or a deletion of events: the rows before it, and the ones it made. */
export interface AgendaUndoInput {
  events: AgendaEvent[]
  created: string[]
}

/** One day of an event, as an agenda shows it. */
export interface AgendaItem {
  /** Unique among the items: the source, the event and the day. */
  key: string
  /** The event: its id (Tandem's), or its UID (a feed's). */
  id: string
  /** The feed it comes from, or null for Tandem's own. */
  feedId: string | null
  /** The feed's name, or null. */
  calendar: string | null
  date: string
  title: string
  start: string | null
  end: string | null
  /** The feed's color, or null for Tandem's own (the app's primary color). */
  color: ChoiceColor | null
  repeat: Repeat | null
  until: string | null
  checked: boolean
}

/** What a check is stored under: Tandem's event id, or a feed's id and the event's UID. */
export function checkRef(item: Pick<AgendaItem, 'id' | 'feedId'>): string {
  return item.feedId ? `${item.feedId}/${item.id}` : item.id
}

const TIME = /^([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?|H([0-5]\d)?)?$/

/** A time written `14:00`, `9:30`, `14h`, `14h30` or `9`, as `HH:MM`; null when it isn't one. */
export function parseTime(text: string): string | null {
  const match = TIME.exec(text.trim())
  if (!match) return null
  const minutes = match[2] ?? match[3] ?? match[4] ?? '00'
  return `${match[1]!.padStart(2, '0')}:${minutes}`
}

/** A `HH:MM` time. */
export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

const LEADING_TIME =
  /^(\d{1,2}(?:[:hH]\d{2}|[hH])?)(?:\s*(?:-|–|—|→|->)\s*(\d{1,2}(?:[:hH]\d{2}|[hH])?))?(?:\s+|$)/

/**
 * An event typed on one line: a time or two at the start, then its title. `14:00 Standup`,
 * `13:30-14:30 Lunch` (or `→`), `Paul's birthday` (no time: all day). A number that isn't a
 * time (`2026 plan`) is part of the title.
 */
export function parseEventLine(text: string): {
  title: string
  start: string | null
  end: string | null
} {
  const line = text.replace(/\s+/g, ' ').trim()
  const match = LEADING_TIME.exec(line)
  const start = match ? parseTime(match[1]!) : null
  const end = match?.[2] ? parseTime(match[2]) : null
  if (!match || !start || (match[2] && !end)) return { title: line, start: null, end: null }
  return {
    title: line.slice(match[0].length).trim(),
    start,
    end: end && end !== start ? end : null,
  }
}

/** The time label: `day` (all day), `14:00`, or `13:30 → 14:30`. */
export function timeLabel(event: Pick<AgendaItem, 'start' | 'end'>): string {
  if (!event.start) return 'day'
  return event.end ? `${event.start} → ${event.end}` : event.start
}

/** An agenda's order: all-day events first, then by time, then by title. */
export function compareItems(a: AgendaItem, b: AgendaItem): number {
  if (!a.start !== !b.start) return a.start ? 1 : -1
  return (
    (a.start ?? '').localeCompare(b.start ?? '') ||
    (a.end ?? '').localeCompare(b.end ?? '') ||
    a.title.localeCompare(b.title)
  )
}

/** A day's midnight in UTC: days apart in UTC are whole, whatever the daylight saving time. */
function utcDay(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day)
}

/** Days from `a` to `b` (negative when `b` is before). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcDay(b) - utcDay(a)) / 86_400_000)
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** The day `months` after `iso`, on the same date, or the month's last day when it has none. */
function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
  const total = year * 12 + (month - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  const d = Math.min(day, daysInMonth(y, m))
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * The days of an event between `from` and `to` (included), in order. A repeating event starts on
 * its day (even a Saturday for every weekday) and goes on until `until`, without its skipped
 * days. Monthly and yearly ones fall on the month's last day when theirs doesn't exist (the 31st,
 * 29 February).
 */
export function eventDays(
  event: Pick<AgendaEvent, 'date' | 'repeat' | 'until' | 'skipped'>,
  from: string,
  to: string,
): string[] {
  const last = event.until && event.until < to ? event.until : to
  if (event.date > last) return []
  const skipped = new Set(event.skipped)
  const days: string[] = []
  const push = (day: string) => {
    if (day >= from && day <= last && !skipped.has(day)) days.push(day)
  }
  switch (event.repeat) {
    case null:
      push(event.date)
      break
    case 'daily':
    case 'weekdays':
    case 'weekly':
    case 'biweekly': {
      const step = event.repeat === 'weekly' ? 7 : event.repeat === 'biweekly' ? 14 : 1
      // Straight to the first day in the range.
      const ahead = Math.max(0, daysBetween(event.date, from))
      let day = addDays(event.date, Math.ceil(ahead / step) * step)
      if (event.date >= from) push(event.date)
      for (; day <= last; day = addDays(day, step)) {
        if (day === event.date) continue
        const weekday = dateOf(day).getDay()
        if (event.repeat === 'weekdays' && (weekday === 0 || weekday === 6)) continue
        push(day)
      }
      break
    }
    case 'monthly':
    case 'yearly': {
      const step = event.repeat === 'monthly' ? 1 : 12
      const [y1, m1] = event.date.split('-').map(Number) as [number, number]
      const [y2, m2] = from.split('-').map(Number) as [number, number]
      const monthsAhead = Math.max(0, (y2 - y1) * 12 + (m2 - m1) - 1)
      for (let n = Math.floor(monthsAhead / step) * step; ; n += step) {
        const day = addMonths(event.date, n)
        if (day > last) break
        push(day)
      }
      break
    }
  }
  return days
}

/** Checks an event's fields (`date` and `until` days, times, an end only after a start). */
export function eventProblem(event: {
  title?: string
  date?: string
  start?: string | null
  end?: string | null
  repeat?: string | null
  until?: string | null
}): string | null {
  if (event.title !== undefined && !event.title.trim()) return 'An event needs a title'
  if (event.date !== undefined && !isIsoDate(event.date))
    return `Not a day: "${event.date}" (use YYYY-MM-DD)`
  if (event.start && !isTime(event.start)) return `Not a time: "${event.start}" (use HH:MM)`
  if (event.end && !isTime(event.end)) return `Not a time: "${event.end}" (use HH:MM)`
  if (event.end && !event.start) return 'An end time needs a start time'
  if (event.repeat && !(REPEATS as readonly string[]).includes(event.repeat))
    return `Not a repeat: "${event.repeat}" (${REPEATS.join(', ')})`
  if (event.until && !isIsoDate(event.until)) return `Not a day: "${event.until}" (use YYYY-MM-DD)`
  return null
}

/**
 * One line of an agenda, for agents (MCP, CLI): `- [ ] 14:00 → 15:00 Standup (id …, every day)`.
 * A feed's events say their calendar, and that they can't be changed.
 */
export function agendaLine(item: AgendaItem): string {
  const about = item.feedId
    ? `${item.calendar ?? 'feed'}, read-only`
    : [
        `id ${item.id}`,
        item.repeat && REPEAT_LABELS[item.repeat].toLowerCase(),
        item.until && `until ${item.until}`,
      ]
        .filter(Boolean)
        .join(', ')
  return `- [${item.checked ? 'x' : ' '}] ${timeLabel(item)} ${item.title}  (${about})`
}
