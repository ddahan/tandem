// The agenda, in SQLite (see @tandem/shared's agenda.ts): Tandem's own events, the days checked
// off, and calendar feeds with the last good copy of each (feeds.ts reads them). The vault calls
// these under its lock and announces the changes.
//
// Changing a repeating event asks which days: `one` takes that day out of it (skipped) into an
// event of its own; `all` applies from today on: an event that began before today ends
// yesterday, and a new one carries on from today with the change, so that past days stay as
// they were (their time, title and checkmark).
import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import {
  EVENT_TITLE_MAX,
  addDays,
  checkRef,
  compareItems,
  eventDays,
  eventProblem,
  isIsoDate,
  isoDate,
  type AgendaEvent,
  type AgendaFeed,
  type AgendaItem,
  type AgendaUndoInput,
  type ChoiceColor,
  type Repeat,
} from '@tandem/shared'
import type { Db } from '../db/client.ts'
import { agendaChecks, agendaEvents, agendaFeeds } from '../db/schema.ts'
import { NotFoundError, ValidationError } from './errors.ts'
import { FEED_COLORS, feedDays, feedUrl, parseFeed, type ParsedFeed } from './feeds.ts'

// Letters and digits only: ids are typed in commands (as databases' and bookmarks').
const newId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12)

type EventRecord = typeof agendaEvents.$inferSelect
type FeedRecord = typeof agendaFeeds.$inferSelect

export interface EventInput {
  title: string
  date: string
  start?: string | null
  end?: string | null
  repeat?: Repeat | null
  until?: string | null
}

export type EventPatch = Partial<EventInput>

/** Which days of a repeating event a change is for: the one given, or all from today on. */
export interface EventScope {
  /** The day the change was made on (required for `one`). */
  date?: string
  scope?: 'one' | 'all'
}

/** The rows a change replaced or removed, and the events it made: undoing puts them back. */
export type AgendaUndo = AgendaUndoInput

/** Ranges of days asked for at once, at most: two months and a half (a month's calendar). */
const MAX_RANGE_DAYS = 120

export class AgendaStore {
  private readonly db: Db
  private readonly now: () => number
  /** Feeds read once per copy (their id and when it was read). */
  private readonly parsed = new Map<string, { at: number | null; feed: ParsedFeed }>()

  constructor(db: Db, now: () => number) {
    this.db = db
    this.now = now
  }

  private today(): string {
    return isoDate(new Date(this.now()))
  }

  /** Every event and feed event on the days from `from` to `to`, in the agenda's order per day. */
  async items(from: string, to: string): Promise<AgendaItem[]> {
    if (!isIsoDate(from) || !isIsoDate(to)) throw new ValidationError('Days are written YYYY-MM-DD')
    if (to < from) return []
    if (addDays(from, MAX_RANGE_DAYS) < to)
      throw new ValidationError(`At most ${MAX_RANGE_DAYS} days at once`)
    const items: AgendaItem[] = []
    for (const event of await this.events()) {
      for (const date of eventDays(event, from, to)) {
        items.push({
          key: `own:${event.id}:${date}`,
          id: event.id,
          feedId: null,
          calendar: null,
          date,
          title: event.title,
          start: event.start,
          end: event.end,
          color: null,
          repeat: event.repeat,
          until: event.until,
          checked: false,
        })
      }
    }
    for (const record of await this.feedRecords()) {
      const feed = this.parsedFeed(record)
      if (!feed) continue
      for (const day of feedDays(feed, from, to)) {
        items.push({
          key: `feed:${record.id}:${day.uid}:${day.date}:${day.start ?? ''}`,
          id: day.uid,
          feedId: record.id,
          calendar: record.name,
          date: day.date,
          title: day.title,
          start: day.start,
          end: day.end,
          color: record.color as ChoiceColor,
          repeat: null,
          until: null,
          checked: false,
        })
      }
    }
    if (items.length) {
      const checks = await this.db
        .select()
        .from(agendaChecks)
        .where(inArray(agendaChecks.ref, [...new Set(items.map(checkRef))]))
      const checked = new Set(checks.map((check) => `${check.ref} ${check.date}`))
      for (const item of items) item.checked = checked.has(`${checkRef(item)} ${item.date}`)
    }
    return items.toSorted((a, b) => a.date.localeCompare(b.date) || compareItems(a, b))
  }

  async events(): Promise<AgendaEvent[]> {
    const records = await this.db.select().from(agendaEvents).orderBy(asc(agendaEvents.date))
    return records.map(toEvent)
  }

  async get(id: string): Promise<AgendaEvent> {
    return toEvent(await this.record(id))
  }

  async create(input: EventInput): Promise<AgendaEvent> {
    const values = clean(input)
    const id = newId()
    const now = this.now()
    await this.db
      .insert(agendaEvents)
      .values({ id, ...values, skipped: '[]', createdAt: now, updatedAt: now })
    return this.get(id)
  }

  /**
   * Changes an event (see the module's comment for repeating ones). Returns the event that has
   * the change (a new one when a day or the days ahead were taken out), and how to undo it.
   */
  async update(
    id: string,
    patch: EventPatch,
    where: EventScope = {},
  ): Promise<{ event: AgendaEvent; undo: AgendaUndo }> {
    const before = await this.get(id)
    const next = clean({ ...before, ...patch })
    const now = this.now()
    const undo: AgendaUndo = { events: [before], created: [] }

    if (before.repeat && where.scope === 'one') {
      const day = where.date
      if (!day || !eventDays(before, day, day).length)
        throw new ValidationError(`This event isn't on ${day ?? 'that day'}`)
      // That day, out of the repeat, as an event of its own (on the day it was moved to).
      await this.setSkipped(id, [...before.skipped, day])
      const single = { ...next, date: patch.date ?? day, repeat: null, until: null }
      const created = newId()
      await this.db.insert(agendaEvents).values({
        id: created,
        ...single,
        skipped: '[]',
        seriesId: id,
        createdAt: now,
        updatedAt: now,
      })
      await this.moveChecks(id, created, (date) => date === day, single.date)
      undo.created.push(created)
      return { event: await this.get(created), undo }
    }

    const today = this.today()
    const pastDays =
      before.repeat && before.date < today ? eventDays(before, before.date, addDays(today, -1)) : []
    const ahead = before.repeat
      ? eventDays(before, today, before.until ?? addDays(today, 3700)).slice(0, 1)
      : []
    if (before.repeat && pastDays.length && ahead.length) {
      // From today on: the past stays with this event, which ends yesterday.
      await this.db
        .update(agendaEvents)
        .set({ until: addDays(today, -1), updatedAt: now })
        .where(eq(agendaEvents.id, id))
      const created = newId()
      const first = patch.date ?? ahead[0]!
      await this.db.insert(agendaEvents).values({
        id: created,
        ...next,
        date: first,
        skipped: JSON.stringify(before.skipped.filter((day) => day >= first)),
        createdAt: now,
        updatedAt: now,
      })
      await this.moveChecks(id, created, (date) => date >= today)
      await this.db
        .update(agendaEvents)
        .set({ seriesId: created })
        .where(and(eq(agendaEvents.seriesId, id), gte(agendaEvents.date, today)))
      undo.created.push(created)
      return { event: await this.get(created), undo }
    }

    // Days no longer in the repeat aren't skipped anymore.
    const skipped = next.repeat && !patch.date ? before.skipped : []
    await this.db
      .update(agendaEvents)
      .set({ ...next, skipped: JSON.stringify(skipped), updatedAt: now })
      .where(eq(agendaEvents.id, id))
    return { event: await this.get(id), undo }
  }

  /**
   * Deletes an event: one day of a repeating event (`one`), or the days ahead (`all`: one begun
   * before today ends yesterday, its past days kept). Days changed alone go with them.
   */
  async remove(id: string, where: EventScope = {}): Promise<AgendaUndo> {
    const before = await this.get(id)
    const undo: AgendaUndo = { events: [before], created: [] }
    if (before.repeat && where.scope === 'one') {
      const day = where.date
      if (!day || !eventDays(before, day, day).length)
        throw new ValidationError(`This event isn't on ${day ?? 'that day'}`)
      await this.setSkipped(id, [...before.skipped, day])
      return undo
    }
    const today = this.today()
    const singles = (
      await this.db.select().from(agendaEvents).where(eq(agendaEvents.seriesId, id))
    ).map(toEvent)
    const past =
      before.repeat &&
      before.date < today &&
      eventDays(before, before.date, addDays(today, -1)).length > 0
    if (past) {
      await this.db
        .update(agendaEvents)
        .set({ until: addDays(today, -1), updatedAt: this.now() })
        .where(eq(agendaEvents.id, id))
      const ahead = singles.filter((single) => single.date >= today)
      await this.deleteRows(ahead.map((single) => single.id))
      undo.events.push(...ahead)
    } else {
      await this.deleteRows([id, ...singles.map((single) => single.id)])
      undo.events.push(...singles)
    }
    return undo
  }

  /** Puts back what a change replaced or removed (`AgendaUndo`), and removes what it made. */
  async restore(undo: AgendaUndo): Promise<void> {
    await this.deleteRows(undo.created)
    for (const event of undo.events) {
      const problem = eventProblem(event)
      if (problem || !/^[A-Za-z0-9]{1,64}$/.test(event.id))
        throw new ValidationError(problem ?? 'Not an event id')
      const row = {
        title: clip(event.title),
        date: event.date,
        start: event.start,
        end: event.start ? event.end : null,
        repeat: event.repeat,
        until: event.until,
        skipped: JSON.stringify(event.skipped.filter(isIsoDate)),
        seriesId: event.seriesId,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      }
      await this.db
        .insert(agendaEvents)
        .values({ id: event.id, ...row })
        .onConflictDoUpdate({ target: agendaEvents.id, set: row })
    }
  }

  /** Checks (or unchecks) a day of an event: `ref` is `checkRef(item)`. */
  async setChecked(ref: string, date: string, checked: boolean): Promise<void> {
    if (!isIsoDate(date)) throw new ValidationError(`Not a day: "${date}" (use YYYY-MM-DD)`)
    if (checked) {
      await this.db.insert(agendaChecks).values({ ref, date }).onConflictDoNothing()
    } else {
      await this.db
        .delete(agendaChecks)
        .where(and(eq(agendaChecks.ref, ref), eq(agendaChecks.date, date)))
    }
  }

  // --- Feeds -----------------------------------------------------------------------------------

  async feeds(): Promise<AgendaFeed[]> {
    return (await this.feedRecords()).map((record) => this.toFeed(record))
  }

  async feed(id: string): Promise<AgendaFeed> {
    return this.toFeed(await this.feedRecord(id))
  }

  /** A new feed, not read yet (`refreshFeed` reads it). */
  async createFeed(input: { name: string; url: string; color?: ChoiceColor }): Promise<AgendaFeed> {
    const url = feedUrl(input.url)
    if (!url)
      throw new ValidationError('A calendar feed needs a web address (https, http or webcal)')
    const existing = await this.feedRecords()
    const name = clip(input.name) || new URL(url).hostname
    const id = newId()
    await this.db.insert(agendaFeeds).values({
      id,
      name,
      url,
      color: input.color ?? FEED_COLORS[existing.length % FEED_COLORS.length]!,
      position: existing.reduce((max, feed) => Math.max(max, feed.position), 0) + 1,
      createdAt: this.now(),
    })
    return this.feed(id)
  }

  async updateFeed(
    id: string,
    patch: { name?: string; url?: string; color?: ChoiceColor },
  ): Promise<AgendaFeed> {
    const record = await this.feedRecord(id)
    const changes: Partial<FeedRecord> = {}
    if (patch.name !== undefined) {
      changes.name = clip(patch.name)
      if (!changes.name) throw new ValidationError('A calendar feed needs a name')
    }
    if (patch.color !== undefined) changes.color = patch.color
    if (patch.url !== undefined) {
      const url = feedUrl(patch.url)
      if (!url)
        throw new ValidationError('A calendar feed needs a web address (https, http or webcal)')
      if (url !== record.url)
        Object.assign(changes, { url, content: null, fetchedAt: null, error: null })
    }
    if (Object.keys(changes).length)
      await this.db.update(agendaFeeds).set(changes).where(eq(agendaFeeds.id, id))
    return this.feed(id)
  }

  async deleteFeed(id: string): Promise<void> {
    await this.feedRecord(id)
    await this.db.delete(agendaFeeds).where(eq(agendaFeeds.id, id))
    this.parsed.delete(id)
  }

  /**
   * Keeps what reading a feed gave (`readFeed`, outside the vault's lock: it can take seconds):
   * its text, or why it failed, which keeps the last good copy (its events still show). A feed
   * whose address changed meanwhile is left alone. Returns whether its events may have changed.
   */
  async saveFeedRead(
    id: string,
    url: string,
    read: { content: string } | { error: unknown },
  ): Promise<boolean> {
    const record = await this.db.select().from(agendaFeeds).where(eq(agendaFeeds.id, id)).get()
    if (!record || record.url !== url) return false
    if ('content' in read) {
      try {
        parseFeed(read.content)
        await this.db
          .update(agendaFeeds)
          .set({ content: read.content, fetchedAt: this.now(), error: null })
          .where(eq(agendaFeeds.id, id))
        return read.content !== record.content || record.error !== null
      } catch (error) {
        read = { error }
      }
    }
    const message =
      read.error instanceof ValidationError ? read.error.message : 'This calendar can’t be read'
    await this.db.update(agendaFeeds).set({ error: message }).where(eq(agendaFeeds.id, id))
    return record.error !== message
  }

  private toFeed(record: FeedRecord): AgendaFeed {
    return {
      id: record.id,
      name: record.name,
      url: record.url,
      color: record.color as ChoiceColor,
      fetchedAt: record.fetchedAt,
      error: record.error,
      events: this.parsedFeed(record)?.events.length ?? 0,
    }
  }

  /** The feed's events, read once per copy; none before it was read. */
  private parsedFeed(record: FeedRecord): ParsedFeed | null {
    if (!record.content) return null
    const known = this.parsed.get(record.id)
    if (known && known.at === record.fetchedAt) return known.feed
    try {
      const feed = parseFeed(record.content)
      this.parsed.set(record.id, { at: record.fetchedAt, feed })
      return feed
    } catch {
      return null
    }
  }

  private async feedRecords(): Promise<FeedRecord[]> {
    return this.db.select().from(agendaFeeds).orderBy(asc(agendaFeeds.position))
  }

  private async feedRecord(id: string): Promise<FeedRecord> {
    const record = await this.db.select().from(agendaFeeds).where(eq(agendaFeeds.id, id)).get()
    if (!record) throw new NotFoundError('No such calendar feed')
    return record
  }

  private async record(id: string): Promise<EventRecord> {
    const record = await this.db.select().from(agendaEvents).where(eq(agendaEvents.id, id)).get()
    if (!record) throw new NotFoundError('No such event')
    return record
  }

  private async setSkipped(id: string, skipped: string[]) {
    await this.db
      .update(agendaEvents)
      .set({ skipped: JSON.stringify([...new Set(skipped)].toSorted()), updatedAt: this.now() })
      .where(eq(agendaEvents.id, id))
  }

  /** Moves the checks of an event's days (those `which` keeps) to another event. */
  private async moveChecks(
    from: string,
    to: string,
    which: (date: string) => boolean,
    date?: string,
  ) {
    const checks = await this.db.select().from(agendaChecks).where(eq(agendaChecks.ref, from))
    for (const check of checks.filter((row) => which(row.date))) {
      await this.db
        .delete(agendaChecks)
        .where(and(eq(agendaChecks.ref, from), eq(agendaChecks.date, check.date)))
      await this.db
        .insert(agendaChecks)
        .values({ ref: to, date: date ?? check.date })
        .onConflictDoNothing()
    }
  }

  private async deleteRows(ids: string[]) {
    if (ids.length) await this.db.delete(agendaEvents).where(inArray(agendaEvents.id, ids))
  }
}

/** An event's fields, checked and tidied (an end without a start, `until` before the day: gone). */
function clean(input: EventInput) {
  const title = clip(input.title)
  const start = input.start || null
  const end = start ? input.end || null : null
  const repeat = input.repeat ?? null
  const until = repeat ? input.until || null : null
  const problem = eventProblem({ title, date: input.date, start, end, repeat, until })
  if (problem) throw new ValidationError(problem)
  if (until && until < input.date)
    throw new ValidationError('It can’t stop repeating before it starts')
  return { title, date: input.date, start, end: end === start ? null : end, repeat, until }
}

function clip(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, EVENT_TITLE_MAX).trim()
}

function toEvent(record: EventRecord): AgendaEvent {
  return {
    id: record.id,
    title: record.title,
    date: record.date,
    start: record.start,
    end: record.end,
    repeat: record.repeat as Repeat | null,
    until: record.until,
    skipped: JSON.parse(record.skipped) as string[],
    seriesId: record.seriesId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}
