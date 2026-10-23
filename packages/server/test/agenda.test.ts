// The agenda: Tandem's events (repeats, a day changed alone or all of them from today on, undo,
// checks), calendar feeds (read, kept when unreadable, their events), and empty days.
import { describe, expect, it } from 'vitest'
import { AGENDA_BLOCK, OWNER } from '@tandem/shared'
import { NotFoundError, ValidationError } from '../src/vault/errors.ts'
import { feedDays, feedUrl, parseFeed } from '../src/vault/feeds.ts'
import { createTestVault } from './helpers.ts'

// The test clock's today (helpers.ts): Saturday 17 October 2026.
const TODAY = '2026-10-17'

const titles = (items: { title: string }[]) => items.map((item) => item.title)

describe('agenda events', () => {
  it('shows events by day, all-day ones first, then by time', async () => {
    const { vault } = await createTestVault()
    const events: unknown[] = []
    vault.events.on('event', (event) => events.push(event))
    await vault.createEvent({ title: 'Lunch', date: TODAY, start: '12:30', end: '13:30' })
    await vault.createEvent({ title: "Paul's birthday", date: TODAY })
    await vault.createEvent({ title: 'Standup', date: TODAY, start: '09:00' })
    await vault.createEvent({ title: 'Tomorrow', date: '2026-10-18' })
    expect(titles(await vault.agendaItems(TODAY))).toEqual(["Paul's birthday", 'Standup', 'Lunch'])
    const items = await vault.agendaItems(TODAY, '2026-10-18')
    expect(items.at(-1)).toMatchObject({ title: 'Tomorrow', date: '2026-10-18', color: null })
    expect(events).toContainEqual({ type: 'agenda' })
  })

  it('refuses what isn’t an event', async () => {
    const { vault } = await createTestVault()
    await expect(vault.createEvent({ title: ' ', date: TODAY })).rejects.toThrow(ValidationError)
    await expect(vault.createEvent({ title: 'A', date: '2026-13-01' })).rejects.toThrow(
      ValidationError,
    )
    await expect(
      vault.createEvent({ title: 'A', date: TODAY, repeat: 'daily', until: '2026-10-01' }),
    ).rejects.toThrow(/before it starts/)
    await expect(vault.getEvent('nope')).rejects.toThrow(NotFoundError)
    await expect(vault.agendaItems('2026-01-01', '2026-12-31')).rejects.toThrow(/At most/)
    expect(await vault.agendaItems('2026-10-20', '2026-10-19')).toEqual([])
  })

  it('tidies an event: an end without a start, or the same as it, goes', async () => {
    const { vault } = await createTestVault()
    const event = await vault.createEvent({
      title: '  Call  ',
      date: TODAY,
      start: '10:00',
      end: '10:00',
    })
    expect(event).toMatchObject({ title: 'Call', start: '10:00', end: null, repeat: null })
    const { event: allDay } = await vault.updateEvent(event.id, { start: null })
    expect(allDay).toMatchObject({ start: null, end: null })
  })

  it('checks off one day of a repeating event', async () => {
    const { vault } = await createTestVault()
    const event = await vault.createEvent({
      title: 'Standup',
      date: TODAY,
      start: '09:00',
      repeat: 'daily',
    })
    await vault.checkEvent(event.id, '2026-10-19', true)
    const items = await vault.agendaItems('2026-10-18', '2026-10-20')
    expect(items.map((item) => item.checked)).toEqual([false, true, false])
    await vault.checkEvent(event.id, '2026-10-19', false)
    expect((await vault.agendaItems('2026-10-19'))[0]!.checked).toBe(false)
    await expect(vault.checkEvent(event.id, 'monday', true)).rejects.toThrow(ValidationError)
  })

  it('changes one day of a repeating event alone, its check with it', async () => {
    const { vault } = await createTestVault()
    const event = await vault.createEvent({
      title: 'Standup',
      date: TODAY,
      start: '09:00',
      repeat: 'daily',
    })
    await vault.checkEvent(event.id, '2026-10-19', true)
    const { event: moved, undo } = await vault.updateEvent(
      event.id,
      { start: '10:00' },
      { date: '2026-10-19', scope: 'one' },
    )
    expect(moved).toMatchObject({
      date: '2026-10-19',
      start: '10:00',
      repeat: null,
      seriesId: event.id,
    })
    const days = await vault.agendaItems('2026-10-18', '2026-10-20')
    expect(days.map((item) => `${item.date} ${item.start} ${item.checked}`)).toEqual([
      '2026-10-18 09:00 false',
      '2026-10-19 10:00 true',
      '2026-10-20 09:00 false',
    ])
    await vault.restoreEvents(undo)
    expect((await vault.agendaItems('2026-10-19')).map((item) => item.start)).toEqual(['09:00'])
    await expect(
      vault.updateEvent(event.id, { title: 'X' }, { date: '2026-10-01', scope: 'one' }),
    ).rejects.toThrow(/isn't on/)
  })

  it('changes all days from today on, past days kept as they were', async () => {
    const { vault } = await createTestVault()
    const event = await vault.createEvent({
      title: 'Standup',
      date: '2026-10-12',
      start: '09:00',
      repeat: 'daily',
    })
    await vault.checkEvent(event.id, '2026-10-16', true)
    await vault.checkEvent(event.id, TODAY, true)
    const single = (
      await vault.updateEvent(event.id, { title: 'Moved' }, { date: '2026-10-20', scope: 'one' })
    ).event
    const { event: ahead, undo } = await vault.updateEvent(
      event.id,
      { title: 'Daily', start: '09:30' },
      { scope: 'all' },
    )
    expect(ahead).toMatchObject({
      date: TODAY,
      title: 'Daily',
      start: '09:30',
      repeat: 'daily',
      skipped: ['2026-10-20'],
    })
    expect(await vault.getEvent(event.id)).toMatchObject({ until: '2026-10-16', title: 'Standup' })
    expect(await vault.getEvent(single.id)).toMatchObject({ seriesId: ahead.id })
    const days = await vault.agendaItems('2026-10-16', '2026-10-20')
    expect(days.map((item) => `${item.date} ${item.title} ${item.start} ${item.checked}`)).toEqual([
      '2026-10-16 Standup 09:00 true',
      '2026-10-17 Daily 09:30 true',
      '2026-10-18 Daily 09:30 false',
      '2026-10-19 Daily 09:30 false',
      '2026-10-20 Moved 09:00 false',
    ])
    // Undone: one event again, as it was.
    await vault.restoreEvents(undo)
    expect((await vault.listEvents()).map((e) => e.id).toSorted()).toEqual(
      [event.id, single.id].toSorted(),
    )
    expect(await vault.getEvent(event.id)).toMatchObject({ until: null, title: 'Standup' })
  })

  it('changes a repeating event that starts today or later in place', async () => {
    const { vault } = await createTestVault()
    const event = await vault.createEvent({ title: 'Gym', date: '2026-10-20', repeat: 'weekly' })
    const { event: changed } = await vault.updateEvent(event.id, {
      repeat: 'biweekly',
      until: '2026-12-31',
    })
    expect(changed).toMatchObject({ id: event.id, repeat: 'biweekly', until: '2026-12-31' })
    const { event: once } = await vault.updateEvent(event.id, { repeat: null })
    expect(once).toMatchObject({ repeat: null, until: null })
  })

  it('deletes one day, or the days ahead of a repeating event, and undoes it', async () => {
    const { vault } = await createTestVault()
    const event = await vault.createEvent({ title: 'Standup', date: '2026-10-12', repeat: 'daily' })
    await vault.deleteEvent(event.id, { date: '2026-10-19', scope: 'one' })
    expect((await vault.agendaItems('2026-10-18', '2026-10-20')).map((i) => i.date)).toEqual([
      '2026-10-18',
      '2026-10-20',
    ])
    const moved = (
      await vault.updateEvent(event.id, { title: 'Later' }, { date: '2026-10-21', scope: 'one' })
    ).event
    const undo = await vault.deleteEvent(event.id)
    expect(await vault.getEvent(event.id)).toMatchObject({ until: '2026-10-16' })
    expect(await vault.agendaItems(TODAY, '2026-10-25')).toEqual([])
    expect((await vault.agendaItems('2026-10-16')).length).toBe(1)
    await vault.restoreEvents(undo)
    expect(await vault.getEvent(moved.id)).toMatchObject({ title: 'Later' })
    expect(await vault.getEvent(event.id)).toMatchObject({ until: null })
    await expect(vault.deleteEvent(event.id, { scope: 'one' })).rejects.toThrow(ValidationError)
  })

  it('deletes an event that hasn’t begun, or a single one, for good', async () => {
    const { vault } = await createTestVault()
    const later = await vault.createEvent({ title: 'Later', date: '2026-11-01', repeat: 'monthly' })
    const once = await vault.createEvent({ title: 'Once', date: TODAY })
    await vault.deleteEvent(later.id)
    const undo = await vault.deleteEvent(once.id)
    expect(await vault.listEvents()).toEqual([])
    await vault.restoreEvents(undo)
    expect(titles(await vault.listEvents())).toEqual(['Once'])
  })
})

describe('days with an agenda', () => {
  it('counts a note holding only its agenda block as nothing written', async () => {
    const { vault } = await createTestVault()
    const day = await vault.calendarNote('2026-10-21', OWNER)
    await vault.saveContent(day.id, `${AGENDA_BLOCK}\n`, { author: OWNER })
    expect((await vault.calendarMonth('2026-10'))[0]).toMatchObject({ written: false })
    await vault.saveContent(day.id, `${AGENDA_BLOCK}\n\nNotes.\n`, { author: OWNER })
    expect((await vault.calendarMonth('2026-10'))[0]).toMatchObject({ written: true })
  })
})

const FEED = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:weekly@test
DTSTART;TZID=Europe/Paris:20261005T140000
DTEND;TZID=Europe/Paris:20261005T150000
RRULE:FREQ=WEEKLY
EXDATE;TZID=Europe/Paris:20261012T140000
SUMMARY:Team sync
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
RECURRENCE-ID;TZID=Europe/Paris:20261019T140000
DTSTART;TZID=Europe/Paris:20261019T160000
DTEND;TZID=Europe/Paris:20261019T170000
SUMMARY:Team sync (moved)
END:VEVENT
BEGIN:VEVENT
UID:trip@test
DTSTART;VALUE=DATE:20261016
DTEND;VALUE=DATE:20261019
SUMMARY:Trip
END:VEVENT
BEGIN:VEVENT
UID:utc@test
DTSTART:20261017T080000Z
DTEND:20261017T083000Z
SUMMARY:
END:VEVENT
BEGIN:VEVENT
UID:gone@test
DTSTART:20261017T100000Z
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
END:VCALENDAR
`

/** A local `HH:MM` of a UTC time (the tests run in any time zone). */
function localTime(utc: string) {
  const date = new Date(utc)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function calendarResponse() {
  return new Response(FEED, { headers: { 'content-type': 'text/calendar' } })
}

describe('calendar feeds', () => {
  it('reads repeats, their exceptions, all-day days, time zones; leaves out cancelled events', () => {
    const feed = parseFeed(FEED)
    expect(feed.events).toHaveLength(4)
    const days = feedDays(feed, '2026-10-12', '2026-10-26')
    const lines = days.map((day) => `${day.date} ${day.start ?? 'day'} ${day.title}`)
    expect(lines).toEqual(
      expect.arrayContaining([
        `2026-10-19 ${localTime('2026-10-19T14:00:00Z')} Team sync (moved)`,
        // After the change to winter time: 14:00 in Paris is 13:00 UTC.
        `2026-10-26 ${localTime('2026-10-26T13:00:00Z')} Team sync`,
        '2026-10-16 day Trip',
        '2026-10-17 day Trip',
        '2026-10-18 day Trip',
        `2026-10-17 ${localTime('2026-10-17T08:00:00Z')} Untitled event`,
      ]),
    )
    expect(lines.some((line) => line.startsWith('2026-10-12'))).toBe(false)
    expect(lines.some((line) => line.includes('Cancelled'))).toBe(false)
    expect(lines).toHaveLength(6)
    expect(() => parseFeed('not a calendar')).toThrow(ValidationError)
  })

  it('reads webcal addresses as https, and nothing but web addresses', () => {
    expect(feedUrl('webcal://example.com/cal.ics')).toBe('https://example.com/cal.ics')
    expect(feedUrl('ftp://example.com/cal.ics')).toBeNull()
    expect(feedUrl('nope')).toBeNull()
  })

  it('adds a feed, reads it, keeps its last copy when it can’t be read', async () => {
    let answer = calendarResponse
    const fetch = (async () => answer()) as unknown as typeof globalThis.fetch
    const { vault, clock } = await createTestVault({ fetch })
    const feed = await vault.createFeed({ name: 'Work', url: 'webcal://example.com/work.ics' })
    expect(feed).toMatchObject({
      name: 'Work',
      url: 'https://example.com/work.ics',
      color: 'blue',
      error: null,
      events: 4,
    })
    expect(feed.fetchedAt).toBe(clock.now)
    const items = await vault.agendaItems(TODAY)
    expect(items.map((item) => `${item.title} ${item.calendar} ${item.color}`)).toEqual([
      'Trip Work blue',
      'Untitled event Work blue',
    ])
    // Checked off, as Tandem's.
    await vault.checkEvent(`${feed.id}/trip@test`, TODAY, true)
    expect((await vault.agendaItems(TODAY))[0]!.checked).toBe(true)

    answer = () => new Response('nope', { status: 404 })
    expect(await vault.refreshFeed(feed.id)).toMatchObject({
      error: expect.stringMatching(/404/),
      events: 4,
    })
    answer = () => new Response('<html></html>')
    expect((await vault.refreshFeed(feed.id)).error).toMatch(/isn’t a calendar/)
    answer = () => {
      throw new Error('offline')
    }
    await vault.refreshFeeds()
    expect((await vault.listFeeds())[0]!.error).toMatch(/reach/)
    expect(await vault.agendaItems(TODAY)).toHaveLength(2)

    const renamed = await vault.updateFeed(feed.id, { name: 'Job', color: 'green' })
    expect(renamed).toMatchObject({ name: 'Job', color: 'green' })
    answer = () => new Response(FEED)
    expect(await vault.updateFeed(feed.id, { url: 'https://example.com/other.ics' })).toMatchObject(
      {
        url: 'https://example.com/other.ics',
        error: null,
      },
    )
    await expect(vault.updateFeed(feed.id, { name: ' ' })).rejects.toThrow(ValidationError)
    await expect(vault.updateFeed(feed.id, { url: 'nope' })).rejects.toThrow(ValidationError)
    await vault.deleteFeed(feed.id)
    expect(await vault.agendaItems(TODAY)).toEqual([])
    await expect(vault.deleteFeed(feed.id)).rejects.toThrow(NotFoundError)
  })

  it('refuses an address that isn’t one, and says when feeds can’t be read', async () => {
    const { vault } = await createTestVault()
    await expect(vault.createFeed({ name: 'X', url: 'nope' })).rejects.toThrow(ValidationError)
    const feed = await vault.createFeed({ name: '', url: 'https://example.com/a.ics' })
    expect(feed).toMatchObject({
      name: 'example.com',
      error: expect.stringMatching(/can’t be read here/),
    })
  })
})
