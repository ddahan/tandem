// Daily notes: a note per day in Calendar/, created once, summed up per month, dropped when
// left empty.
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OWNER } from '@tandem/shared'
import { ValidationError } from '../src/vault/errors.ts'
import { createTestVault } from './helpers.ts'

describe('daily notes', () => {
  it('creates a day’s note once, in Calendar/, even when asked at the same time', async () => {
    const { vault, dataDir } = await createTestVault()
    const [first, second] = await Promise.all([
      vault.calendarNote('2026-10-21', OWNER),
      vault.calendarNote('2026-10-21', 'claude'),
    ])
    expect(first.id).toBe(second.id)
    expect(first).toMatchObject({ path: 'Calendar/2026-10-21.md', title: '2026-10-21' })
    expect(existsSync(join(dataDir, 'Calendar/2026-10-21.md'))).toBe(true)
    const calendar = (await vault.tree()).find((node) => node.path === 'Calendar')
    expect(calendar).toMatchObject({ kind: 'folder' })
    expect(first.parentId).toBe(calendar!.id)
    await expect(vault.calendarNote('2026-02-30', OWNER)).rejects.toThrow(ValidationError)
  })

  it('reads a day written outside Tandem instead of writing over it', async () => {
    const { vault, dataDir } = await createTestVault()
    await mkdir(join(dataDir, 'Calendar'))
    await writeFile(join(dataDir, 'Calendar/2026-10-20.md'), 'From Finder.\n')
    const node = await vault.calendarNote('2026-10-20', OWNER)
    expect((await vault.getNote(node.id)).content).toBe('From Finder.\n')
  })

  it('goes under a Calendar page when there is one', async () => {
    const { vault } = await createTestVault()
    const page = await vault.createPage({ title: 'Calendar', content: 'Mine.', author: OWNER })
    const day = await vault.calendarNote('2026-10-21', OWNER)
    expect(day.parentId).toBe(page.id)
    expect(day.path).toBe('Calendar/2026-10-21.md')
  })

  it('sums up a month: written days and their to-dos', async () => {
    const { vault } = await createTestVault()
    const busy = await vault.calendarNote('2026-10-21', OWNER)
    await vault.saveContent(busy.id, 'Jour off\n\n- [ ] Door handle\n- [x] Notary\n', {
      author: OWNER,
    })
    await vault.calendarNote('2026-10-22', OWNER)
    const done = await vault.calendarNote('2026-11-02', OWNER)
    await vault.saveContent(done.id, '- [x] All done\n', { author: OWNER })

    const october = await vault.calendarMonth('2026-10')
    expect(october.toSorted((a, b) => a.date.localeCompare(b.date))).toEqual([
      { date: '2026-10-21', id: busy.id, written: true, open: 1, done: 1 },
      { date: '2026-10-22', id: expect.any(String), written: false, open: 0, done: 0 },
    ])
    expect(await vault.calendarMonth('2026-11')).toMatchObject([{ open: 0, done: 1 }])
    await expect(vault.calendarMonth('October')).rejects.toThrow(ValidationError)
  })

  it('drops a day left empty, with its folder, and nothing else', async () => {
    const { vault, dataDir } = await createTestVault()
    const empty = await vault.calendarNote('2026-10-21', OWNER)
    const written = await vault.calendarNote('2026-10-22', OWNER)
    await vault.saveContent(written.id, 'Something.\n', { author: OWNER })
    const page = await vault.createPage({ title: 'Plain', author: OWNER })

    expect(await vault.dropEmptyCalendarNote(written.id)).toBe(false)
    expect(await vault.dropEmptyCalendarNote(page.id)).toBe(false)
    expect(await vault.dropEmptyCalendarNote(empty.id)).toBe(true)
    expect(existsSync(join(dataDir, 'Calendar/2026-10-21.md'))).toBe(false)
    expect((await vault.tree()).map((node) => node.path).toSorted()).toEqual([
      'Calendar',
      'Calendar/2026-10-22.md',
      'Plain.md',
    ])

    // Written, then erased: it has a history, so it stays.
    await vault.saveContent(written.id, '', { author: OWNER })
    expect(await vault.dropEmptyCalendarNote(written.id)).toBe(false)

    // The last day gone, the Calendar folder goes too.
    const last = await vault.calendarNote('2026-12-01', OWNER)
    await vault.remove(written.id)
    expect(await vault.dropEmptyCalendarNote(last.id)).toBe(true)
    expect(existsSync(join(dataDir, 'Calendar'))).toBe(false)
    expect((await vault.tree()).map((node) => node.path)).toEqual(['Plain.md'])
  })
})
