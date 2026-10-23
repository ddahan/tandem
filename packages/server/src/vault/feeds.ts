// Calendar feeds: `.ics` addresses (a public calendar, or the private address Google and iCloud
// give for one's own) read now and then, their events shown read-only in the agenda. ical.js
// reads the format: repeats and their exceptions, time zones, all-day dates. Times are shown in
// the computer's time zone, as daily notes' days.
import ICAL from 'ical.js'
import { addDays, isoDate, type ChoiceColor } from '@tandem/shared'
import { ValidationError } from './errors.ts'
import type { Fetcher } from './web-pages.ts'

const TIMEOUT_MS = 15_000
const MAX_BYTES = 5 * 1024 * 1024
/** Days of one repeating event looked through, at most (an event every day for 50 years). */
const MAX_REPEATS = 20_000

/** The address to read: `webcal://` is `https://`; only http and https. */
export function feedUrl(text: string): string | null {
  const trimmed = text.trim().replace(/^webcals?:\/\//i, 'https://')
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Reads a feed's text; a failure says what went wrong, in words. */
export async function readFeed(fetcher: Fetcher, url: string): Promise<string> {
  let response: Response
  try {
    response = await fetcher(url, {
      headers: { accept: 'text/calendar, */*', 'user-agent': 'Tandem calendar' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new ValidationError('Couldn’t reach this address')
  }
  if (!response.ok)
    throw new ValidationError(`The address answered with an error (${response.status})`)
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_BYTES) throw new ValidationError('This calendar is too large (5 MB at most)')
  const data = await response.arrayBuffer()
  if (data.byteLength > MAX_BYTES)
    throw new ValidationError('This calendar is too large (5 MB at most)')
  const text = new TextDecoder().decode(data)
  if (!/^\s*BEGIN:VCALENDAR/i.test(text))
    throw new ValidationError('This address isn’t a calendar (.ics)')
  return text
}

/** A feed's event on a day, as the agenda shows it. */
export interface FeedDay {
  uid: string
  date: string
  title: string
  start: string | null
  end: string | null
}

export interface ParsedFeed {
  events: ICAL.Event[]
}

/** A feed's events, exceptions tied to their repeating event; a text that isn't one is refused. */
export function parseFeed(text: string): ParsedFeed {
  let root: ICAL.Component
  try {
    root = new ICAL.Component(ICAL.parse(text))
  } catch {
    throw new ValidationError('This calendar can’t be read')
  }
  // Its time zones first: times given in them are converted to the computer's.
  for (const zone of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(zone)
    } catch {
      // A zone that can't be read: its times are read as the computer's.
    }
  }
  const byUid = new Map<string, ICAL.Event>()
  const exceptions: ICAL.Event[] = []
  for (const component of root.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(component)
    if (!event.uid || !event.startDate) continue
    if (event.isRecurrenceException()) exceptions.push(event)
    else byUid.set(event.uid, event)
  }
  for (const exception of exceptions) {
    const event = byUid.get(exception.uid)
    if (event) event.relateException(exception)
  }
  return { events: [...byUid.values()] }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** A date-time's day and `HH:MM`, in the computer's time zone. */
function local(time: ICAL.Time): { date: string; time: string } {
  const date = time.toJSDate()
  return { date: isoDate(date), time: `${pad(date.getHours())}:${pad(date.getMinutes())}` }
}

function cancelled(item: ICAL.Event): boolean {
  return String(item.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'
}

/**
 * The days of a feed's events between `from` and `to` (included). An all-day event over several
 * days shows on each; one with times, on the day it starts.
 */
export function feedDays(feed: ParsedFeed, from: string, to: string): FeedDay[] {
  const days: FeedDay[] = []
  const add = (item: ICAL.Event, startDate: ICAL.Time, endDate: ICAL.Time | null) => {
    if (cancelled(item)) return
    const title = item.summary?.trim() || 'Untitled event'
    if (startDate.isDate) {
      const first = startDate.toString().slice(0, 10)
      // The end is the day after the last one.
      const after = endDate?.isDate ? endDate.toString().slice(0, 10) : addDays(first, 1)
      for (let day = first < from ? from : first; day < after && day <= to; day = addDays(day, 1)) {
        days.push({ uid: item.uid, date: day, title, start: null, end: null })
      }
      return
    }
    const start = local(startDate)
    if (start.date < from || start.date > to) return
    const end = endDate ? local(endDate) : null
    days.push({
      uid: item.uid,
      date: start.date,
      title,
      start: start.time,
      end: end && end.time !== start.time ? end.time : null,
    })
  }
  for (const event of feed.events) {
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate)
      continue
    }
    const iterator = event.iterator()
    for (let count = 0; count < MAX_REPEATS; count++) {
      const next = iterator.next()
      if (!next) break
      const details = event.getOccurrenceDetails(next)
      const first = details.startDate.isDate
        ? details.startDate.toString().slice(0, 10)
        : local(details.startDate).date
      if (first > to) break
      add(details.item, details.startDate, details.endDate)
    }
  }
  return days
}

/** The colors a new feed takes, in turn. */
export const FEED_COLORS: ChoiceColor[] = [
  'blue',
  'green',
  'orange',
  'purple',
  'pink',
  'red',
  'yellow',
  'brown',
  'gray',
]
