// Full-text search over titles, text and attachment names (SQLite FTS5).
//
// - Words match as prefixes (search as you type) and without accents.
// - "Quoted phrases" match exactly; `-word` excludes; `tag:x` and `in:Folder` filter.
// - Ranking: BM25 with titles weighing most, then a small boost for recently updated notes.
// - Typo tolerance: a word that matches nothing in the index is replaced by the closest indexed
//   word (edit distance), and the response says so.
// - Fallback: when words find too little, a trigram index finds them inside other words.
//
// Each page has a fixed rowid in both indexes (table `search_rows`): updates and lookups by page
// go straight to its rows instead of scanning the index. Statements are prepared once.
import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type { SearchResponse, SearchResult } from '@tandem/shared'
import { escapeHtml, foldText } from './text.ts'

export interface ParsedQuery {
  words: string[]
  phrases: string[]
  excluded: string[]
  tags: string[]
  folders: string[]
}

export function parseQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = { words: [], phrases: [], excluded: [], tags: [], folders: [] }
  const tokens = query.match(/-?"[^"]*"?|\S+/g) ?? []
  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (lower.startsWith('tag:') && token.length > 4)
      parsed.tags.push(token.slice(4).replace(/^#/, ''))
    else if (lower.startsWith('in:') && token.length > 3)
      parsed.folders.push(token.slice(3).replace(/^\/|\/$/g, ''))
    else if (token.startsWith('-') && token.length > 1) {
      parsed.excluded.push(...wordsOf(token.slice(1).replace(/"/g, '')))
    } else if (token.startsWith('"')) {
      const phrase = wordsOf(token.replace(/"/g, '')).join(' ')
      if (phrase) parsed.phrases.push(phrase)
    } else parsed.words.push(...wordsOf(token))
  }
  return parsed
}

/** Words as the index sees them (letters and digits, folded). */
function wordsOf(text: string): string[] {
  return foldText(text).match(/[\p{L}\p{N}]+/gu) ?? []
}

function ftsMatch(parsed: ParsedQuery, words: string[]): string | null {
  const positive = [...words.map((w) => `"${w}"*`), ...parsed.phrases.map((p) => `"${p}"`)]
  if (positive.length === 0) return null
  const excluded = parsed.excluded.map((w) => `"${w}"`)
  return excluded.length
    ? `(${positive.join(' AND ')}) NOT (${excluded.join(' OR ')})`
    : positive.join(' AND ')
}

function trigramMatch(parsed: ParsedQuery, words: string[]): string | null {
  // Trigrams need at least 3 characters per term.
  const terms = [...words, ...parsed.phrases].filter((t) => t.length >= 3).map((t) => `"${t}"`)
  if (terms.length === 0 || terms.length < words.length + parsed.phrases.length) return null
  const excluded = parsed.excluded.filter((w) => w.length >= 3).map((w) => `"${w}"`)
  return excluded.length
    ? `(${terms.join(' AND ')}) NOT (${excluded.join(' OR ')})`
    : terms.join(' AND ')
}

/** Damerau-Levenshtein distance (optimal string alignment), stopping above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_row, i) =>
    Array.from({ length: b.length + 1 }, (_cell, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2]![j - 2]! + 1)
      }
      rows[i]![j] = value
      rowMin = Math.min(rowMin, value)
    }
    if (rowMin > max) return max + 1
  }
  return rows[a.length]![b.length]!
}

interface Vocabulary {
  /** Sorted terms, for prefix lookups. */
  terms: string[]
  docs: Map<string, number>
}

export class SearchIndex {
  private vocabulary: Vocabulary | null = null
  private readonly sqlite: DatabaseSync
  private readonly statements = new Map<string, StatementSync>()

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite
  }

  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.sqlite.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }

  private rowidOf(nodeId: string): number | null {
    const row = this.statement('SELECT rowid FROM search_rows WHERE node_id = ?').get(nodeId) as
      | { rowid: number }
      | undefined
    return row?.rowid ?? null
  }

  /** (Re)indexes a page. */
  index(nodeId: string, title: string, body: string, attachments: string[]): void {
    let rowid = this.rowidOf(nodeId)
    if (rowid === null) {
      rowid = Number(
        this.statement('INSERT INTO search_rows (node_id) VALUES (?)').run(nodeId).lastInsertRowid,
      )
    }
    const names = attachments.join('\n')
    for (const table of ['notes_fts', 'notes_trigram']) {
      this.statement(`DELETE FROM ${table} WHERE rowid = ?`).run(rowid)
      this.statement(
        `INSERT INTO ${table} (rowid, node_id, title, body, attachments) VALUES (?, ?, ?, ?, ?)`,
      ).run(rowid, nodeId, title, body, names)
    }
    this.vocabulary = null
  }

  remove(nodeId: string): void {
    const rowid = this.rowidOf(nodeId)
    if (rowid === null) return
    for (const table of ['notes_fts', 'notes_trigram', 'search_rows'])
      this.statement(`DELETE FROM ${table} WHERE rowid = ?`).run(rowid)
    this.vocabulary = null
  }

  /** Indexed attachment names of the given pages. */
  attachmentsOf(ids: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>()
    if (ids.length === 0) return result
    const rows = this.sqlite
      .prepare(
        `SELECT s.node_id AS id, f.attachments FROM search_rows s
         JOIN notes_fts f ON f.rowid = s.rowid
         WHERE s.node_id IN (${ids.map(() => '?').join(',')})`,
      )
      .all(...ids) as { id: string; attachments: string }[]
    for (const row of rows) result.set(row.id, row.attachments ? row.attachments.split('\n') : [])
    return result
  }

  clear(): void {
    this.sqlite.exec('DELETE FROM notes_fts; DELETE FROM notes_trigram; DELETE FROM search_rows;')
    this.vocabulary = null
  }

  private getVocabulary(): Vocabulary {
    if (!this.vocabulary) {
      const rows = this.sqlite.prepare('SELECT term, doc FROM notes_fts_vocab').all() as {
        term: string
        doc: number
      }[]
      this.vocabulary = {
        terms: rows.map((r) => r.term).toSorted(),
        docs: new Map(rows.map((r) => [r.term, r.doc])),
      }
    }
    return this.vocabulary
  }

  private hasPrefix(word: string): boolean {
    const { terms } = this.getVocabulary()
    let low = 0
    let high = terms.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (terms[mid]! < word) low = mid + 1
      else high = mid
    }
    return terms[low]?.startsWith(word) ?? false
  }

  /** The closest indexed word, preferring frequent ones, or null when nothing is close. */
  closestWord(word: string): string | null {
    const max = word.length <= 3 ? 0 : word.length <= 6 ? 1 : 2
    if (max === 0) return null
    const { terms, docs } = this.getVocabulary()
    let best: { term: string; distance: number; docs: number } | null = null
    for (const term of terms) {
      // Compare with the term's beginning too, since words match as prefixes.
      const distance = Math.min(
        editDistance(word, term, max),
        term.length > word.length ? editDistance(word, term.slice(0, word.length), max) : max + 1,
      )
      if (distance > max) continue
      const count = docs.get(term) ?? 0
      if (!best || distance < best.distance || (distance === best.distance && count > best.docs)) {
        best = { term, distance, docs: count }
      }
    }
    return best?.term ?? null
  }

  /** Snippets of the given matches (by rowid), one query per index that found them. */
  private snippets(found: { rowid: number; table: string; match: string }[]): Map<number, string> {
    const result = new Map<number, string>()
    for (const table of ['notes_fts', 'notes_trigram']) {
      const mine = found.filter((f) => f.table === table)
      if (!mine.length) continue
      const rows = this.sqlite
        .prepare(
          `SELECT rowid, snippet(${table}, 2, char(1), char(2), '…', 14) AS snippet
           FROM ${table} WHERE ${table} MATCH ? AND rowid IN (${mine.map(() => '?').join(',')})`,
        )
        .all(mine[0]!.match, ...mine.map((f) => f.rowid)) as { rowid: number; snippet: string }[]
      for (const row of rows) result.set(row.rowid, row.snippet)
    }
    return result
  }

  search(
    query: string,
    options: {
      limit?: number
      now?: number
      candidates?: (ids: string[]) => Map<string, Candidate>
    },
  ): SearchResponse & {
    ids: string[]
    snippets: Map<string, string>
    matchedAttachments: Map<string, string[]>
  } {
    const parsed = parseQuery(query)
    const limit = options.limit ?? 30
    const now = options.now ?? Date.now()

    // Typo tolerance: replace words that match nothing.
    let corrected = false
    const words = parsed.words.map((word) => {
      if (this.hasPrefix(word)) return word
      const replacement = this.closestWord(word)
      if (replacement) {
        corrected = true
        return replacement
      }
      return word
    })

    // Ranks first; snippets (costly) only for the results shown, below.
    type Table = 'notes_fts' | 'notes_trigram'
    const scored = new Map<string, { score: number; rowid: number; table: Table; match: string }>()
    const match = ftsMatch(parsed, words)
    if (match) {
      const rows = this.statement(
        `SELECT rowid, node_id AS id, bm25(notes_fts, 0, 10, 1, 4) AS rank
         FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank LIMIT 500`,
      ).all(match) as { rowid: number; id: string; rank: number }[]
      for (const row of rows)
        scored.set(row.id, { score: -row.rank, rowid: row.rowid, table: 'notes_fts', match })
    }

    if (scored.size < limit) {
      const trigram = trigramMatch(parsed, words)
      if (trigram) {
        const rows = this.statement(
          `SELECT rowid, node_id AS id, bm25(notes_trigram, 0, 10, 1, 4) AS rank
           FROM notes_trigram WHERE notes_trigram MATCH ? ORDER BY rank LIMIT 200`,
        ).all(trigram) as { rowid: number; id: string; rank: number }[]
        // Below every word match: trigram matches are less precise.
        const floor = Math.min(0, ...[...scored.values()].map((s) => s.score))
        for (const row of rows) {
          if (!scored.has(row.id))
            scored.set(row.id, {
              score: floor - 1 / (1 + row.rank * -1),
              rowid: row.rowid,
              table: 'notes_trigram',
              match: trigram,
            })
        }
      }
    }

    const candidates = options.candidates?.([...scored.keys()]) ?? new Map<string, Candidate>()
    const results: { id: string; score: number }[] = []
    for (const [id, { score }] of scored) {
      const candidate = candidates.get(id)
      if (!candidate) continue
      if (!matchesFilters(candidate, parsed)) continue
      // Up to +25% for notes updated in the last weeks.
      const ageDays = Math.max(0, (now - candidate.updatedAt) / 86_400_000)
      const boost = 1 + 0.25 * Math.exp(-ageDays / 30)
      results.push({ id, score: score > 0 ? score * boost : score / boost })
    }
    const ids = results
      .toSorted((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.id)

    const terms = [...words, ...parsed.phrases]
    const snippets = new Map<string, string>()
    const matchedAttachments = new Map<string, string[]>()
    const found = ids.map((id) => scored.get(id)!)
    const rawSnippets = this.snippets(found)
    for (const [index, id] of ids.entries()) {
      snippets.set(id, formatSnippet(rawSnippets.get(found[index]!.rowid) ?? ''))
      const candidate = candidates.get(id)
      matchedAttachments.set(
        id,
        (candidate?.attachments ?? []).filter((name) =>
          terms.some((t) => foldText(name).includes(t)),
        ),
      )
    }

    return {
      results: [],
      correctedQuery: corrected ? rebuildQuery(query, parsed.words, words) : null,
      ids,
      snippets,
      matchedAttachments,
    }
  }
}

export interface Candidate {
  path: string
  tags: string[]
  attachments: string[]
  updatedAt: number
}

export function matchesFilters(candidate: Candidate, parsed: ParsedQuery): boolean {
  const tags = new Set(candidate.tags.map(foldText))
  if (!parsed.tags.every((tag) => tags.has(foldText(tag)))) return false
  const path = foldText(candidate.path)
  return parsed.folders.every((folder) => {
    const prefix = foldText(folder)
    return path.startsWith(`${prefix}/`) || path.includes(`/${prefix}/`)
  })
}

/** Snippet markers (\u0001…\u0002) → `<mark>`, everything else escaped. */
function formatSnippet(raw: string): string {
  return (
    escapeHtml(raw.replace(/\s+/g, ' ').trim())
      // oxlint-disable-next-line no-control-regex -- the markers set in the SQL snippet() call
      .replace(/\u0001/g, '<mark>')
      // oxlint-disable-next-line no-control-regex -- the markers set in the SQL snippet() call
      .replace(/\u0002/g, '</mark>')
  )
}

function rebuildQuery(query: string, original: string[], replaced: string[]): string {
  let result = foldText(query)
  original.forEach((word, i) => {
    const replacement = replaced[i]
    if (replacement && replacement !== word)
      result = result.replace(new RegExp(`\\b${word}\\b`), replacement)
  })
  return result
}

export type { SearchResult }
