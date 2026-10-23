// The agenda's rules: events typed on one line, time labels, order, repeats, the agenda block.
import { describe, expect, it } from 'vitest'
import {
  AGENDA_BLOCK,
  compareItems,
  daysBetween,
  eventDays,
  eventProblem,
  hasAgendaBlock,
  parseEventLine,
  parseTime,
  timeAlone,
  timeLabel,
  typedTime,
  withoutAgenda,
  type AgendaItem,
} from '../src/index.ts'

describe('events typed on one line', () => {
  it('reads times written in many ways', () => {
    expect(parseTime('14:00')).toBe('14:00')
    expect(parseTime('9:30')).toBe('09:30')
    expect(parseTime('14h')).toBe('14:00')
    expect(parseTime('14h30')).toBe('14:30')
    expect(parseTime('9')).toBe('09:00')
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('12:60')).toBeNull()
  })

  it('takes a time or two at the start, the rest as the title', () => {
    expect(parseEventLine('14:00 Standup')).toEqual({ title: 'Standup', start: '14:00', end: null })
    expect(parseEventLine('13:30-14:30 Lunch with Paul')).toEqual({
      title: 'Lunch with Paul',
      start: '13:30',
      end: '14:30',
    })
    expect(parseEventLine('9h → 10h  Review ')).toEqual({
      title: 'Review',
      start: '09:00',
      end: '10:00',
    })
    expect(parseEventLine('14h30 - 15h Call')).toMatchObject({ start: '14:30', end: '15:00' })
    expect(parseEventLine('9 Gym')).toMatchObject({ title: 'Gym', start: '09:00' })
  })

  it('reads anything else as an all-day title', () => {
    expect(parseEventLine("Paul's birthday")).toEqual({
      title: "Paul's birthday",
      start: null,
      end: null,
    })
    expect(parseEventLine('2026 plan')).toEqual({ title: '2026 plan', start: null, end: null })
    expect(parseEventLine('14:00-99 Bad end')).toMatchObject({
      start: null,
      title: '14:00-99 Bad end',
    })
    // The same time twice is one time.
    expect(parseEventLine('10:00-10:00 Call')).toMatchObject({ start: '10:00', end: null })
  })
})

function item(title: string, start: string | null) {
  return { title, start, end: null } as AgendaItem
}

describe('a time typed before the title', () => {
  it('is taken once the title has begun', () => {
    expect(typedTime('14h')).toBeNull()
    expect(typedTime('14h ')).toBeNull()
    expect(typedTime('14h D')).toEqual({ start: '14:00', end: null, title: 'D' })
    // A range on its way stays text.
    expect(typedTime('13:30 -')).toBeNull()
    expect(typedTime('13:30 - 1')).toBeNull()
    expect(typedTime('13:30 - 14:30 L')).toEqual({ start: '13:30', end: '14:30', title: 'L' })
    expect(typedTime('Lunch')).toBeNull()
  })

  it('is taken alone with Tab', () => {
    expect(timeAlone('14h')).toEqual({ start: '14:00', end: null })
    expect(timeAlone('9:30-10:00')).toEqual({ start: '09:30', end: '10:00' })
    expect(timeAlone('14h Standup')).toBeNull()
    expect(timeAlone('')).toBeNull()
  })
})

describe('labels and order', () => {
  it('labels all day, a time, or a start and an end', () => {
    expect(timeLabel({ start: null, end: null })).toBe('day')
    expect(timeLabel({ start: '14:00', end: null })).toBe('14:00')
    expect(timeLabel({ start: '13:30', end: '14:30' })).toBe('13:30 → 14:30')
  })

  it('puts all-day events first, then by time and title', () => {
    const sorted = [item('B', '14:00'), item('Z', null), item('A', '14:00'), item('C', '09:00')]
      .toSorted(compareItems)
      .map((i) => i.title)
    expect(sorted).toEqual(['Z', 'C', 'A', 'B'])
  })
})

function event(
  date: string,
  repeat: Parameters<typeof eventDays>[0]['repeat'],
  until: string | null = null,
  skipped: string[] = [],
) {
  return { date, repeat, until, skipped }
}

describe('repeats', () => {
  it('counts days whatever the daylight saving time', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-10-26', '2026-10-24')).toBe(-2)
  })

  it('shows a single event on its day only', () => {
    expect(eventDays(event('2026-10-21', null), '2026-10-01', '2026-10-31')).toEqual(['2026-10-21'])
    expect(eventDays(event('2026-11-21', null), '2026-10-01', '2026-10-31')).toEqual([])
  })

  it('repeats every day, week, 2 weeks, until a day, without the skipped ones', () => {
    expect(
      eventDays(
        event('2026-10-20', 'daily', '2026-10-23', ['2026-10-22']),
        '2026-10-01',
        '2026-10-31',
      ),
    ).toEqual(['2026-10-20', '2026-10-21', '2026-10-23'])
    expect(eventDays(event('2026-01-05', 'weekly'), '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ])
    expect(eventDays(event('2026-10-01', 'biweekly'), '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-01',
      '2026-10-15',
      '2026-10-29',
    ])
  })

  it('repeats on weekdays, from its own day even on a weekend', () => {
    expect(eventDays(event('2026-10-17', 'weekdays'), '2026-10-17', '2026-10-21')).toEqual([
      '2026-10-17',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ])
  })

  it('falls on the last day of shorter months', () => {
    expect(eventDays(event('2026-01-31', 'monthly'), '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ])
    expect(eventDays(event('2028-02-29', 'yearly'), '2029-01-01', '2032-12-31')).toEqual([
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
    expect(eventDays(event('2026-10-23', 'yearly'), '2099-10-01', '2099-10-31')).toEqual([
      '2099-10-23',
    ])
  })

  it('checks fields', () => {
    expect(eventProblem({ title: ' ' })).toMatch(/title/)
    expect(eventProblem({ date: '2026-02-30' })).toMatch(/Not a day/)
    expect(eventProblem({ start: '25:00' })).toMatch(/Not a time/)
    expect(eventProblem({ end: '10:00' })).toMatch(/start/)
    expect(eventProblem({ repeat: 'hourly' })).toMatch(/Not a repeat/)
    expect(eventProblem({ until: 'soon' })).toMatch(/Not a day/)
    expect(
      eventProblem({ title: 'Ok', date: '2026-10-23', start: '09:00', end: '10:00' }),
    ).toBeNull()
  })
})

describe('the agenda block', () => {
  it('is found, and left out when a day is checked for being empty', () => {
    const note = `${AGENDA_BLOCK}\n\nNotes.\n`
    expect(hasAgendaBlock(note)).toBe(true)
    expect(hasAgendaBlock('```agendas\n```')).toBe(false)
    expect(withoutAgenda(note).trim()).toBe('Notes.')
    expect(withoutAgenda(`${AGENDA_BLOCK}\n`).trim()).toBe('')
  })
})
