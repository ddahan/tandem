import { describe, expect, it } from 'vitest'
import {
  addDays,
  calendarDateOf,
  dayLabel,
  isIsoDate,
  isoWeek,
  taskCounts,
} from '../src/calendar.ts'

describe('calendar', () => {
  it('knows real days, and the days of calendar notes', () => {
    expect(isIsoDate('2026-10-21')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('21/10/2026')).toBe(false)
    expect(calendarDateOf('Calendar/2026-10-21.md')).toBe('2026-10-21')
    expect(calendarDateOf('calendar/2026-10-21.md')).toBe('2026-10-21')
    expect(calendarDateOf('Calendar/Plans.md')).toBeNull()
    expect(calendarDateOf('Projects/Calendar/2026-10-21.md')).toBeNull()
  })

  it('counts days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    // Across the change to winter time (25 October 2026 in France).
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('numbers ISO weeks', () => {
    expect(isoWeek('2026-10-21')).toBe(43)
    expect(isoWeek('2026-01-01')).toBe(1)
    // 1 January 2027 is a Friday: still the last week of 2026.
    expect(isoWeek('2027-01-01')).toBe(53)
    expect(isoWeek('2024-12-30')).toBe(1)
  })

  it('reads days the French way, relative to today', () => {
    expect(dayLabel('2026-10-21', '2026-10-21')).toEqual({
      title: 'Today, Wednesday 21 October',
      short: 'Today',
    })
    expect(dayLabel('2026-10-20', '2026-10-21').title).toBe('Yesterday, Tuesday 20 October')
    expect(dayLabel('2026-10-14', '2026-10-21')).toEqual({
      title: 'Wednesday 14 October',
      short: 'Wed 14 Oct',
    })
    expect(dayLabel('2025-12-31', '2026-10-21').title).toBe('Wednesday 31 December 2025')
  })

  it('counts to-dos, left and done', () => {
    expect(taskCounts('- [ ] a\n- [x] b\n  * [X] c\n1. [ ] d\n- not one [ ]\n')).toEqual({
      open: 2,
      done: 2,
    })
  })
})
