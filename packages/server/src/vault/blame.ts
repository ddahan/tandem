// Line authorship ("blame"): who last changed each line of a note. On every save, the old and
// new contents are diffed line by line; unchanged lines keep their author, the others get the
// author of the save.
//
// The editor re-serializes the whole note on each save, which can rewrite lines it didn't
// really change (`*` bullets become `-`, escaping changes…). Lines are therefore compared after
// a normalization that ignores those formatting-only differences, so that editing one line in
// the app doesn't take the authorship of the whole note.
import { diffArrays } from 'diff'
import type { BlameRange } from '@myfluence/shared'

/** One run of consecutive lines with the same author and time: `[count, author, at]`. */
export type BlameRun = [number, string, number]

interface LineAuthor {
  author: string
  at: number
}

export function splitLines(content: string): string[] {
  if (content === '') return []
  return content.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
}

/** A line without formatting-only differences. */
export function normalizeLine(line: string): string {
  return (
    line
      .replace(/\s+$/, '')
      .replace(/^(\s*)[*+](\s)/, '$1-$2')
      .replace(/^(\s*)(\d+)\)(\s)/, '$1$2.$3')
      .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1')
      .replace(/__(.+?)__/g, '**$1**')
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1_$2_')
      .replace(/&nbsp;| /g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/^(\s*)(?:-{3,}|\*{3,}|_{3,})$/, '$1---')
      // Table separator rows (column padding changes with the content).
      .replace(/^\|?(?:\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/, (row) =>
        row.replace(/\s*(:?)-+(:?)\s*/g, '$1---$2'),
      )
      .replace(/[ \t]+/g, ' ')
  )
}

function expand(runs: BlameRun[]): LineAuthor[] {
  const lines: LineAuthor[] = []
  for (const [count, author, at] of runs) {
    for (let i = 0; i < count; i++) lines.push({ author, at })
  }
  return lines
}

function compress(lines: LineAuthor[]): BlameRun[] {
  const runs: BlameRun[] = []
  for (const line of lines) {
    const last = runs.at(-1)
    if (last && last[1] === line.author && last[2] === line.at) last[0]++
    else runs.push([1, line.author, line.at])
  }
  return runs
}

/** Authorship of a brand new content: every line by `author`. */
export function initialBlame(content: string, author: string, at: number): BlameRun[] {
  const count = splitLines(content).length
  return count ? [[count, author, at]] : []
}

/** Authorship of `newContent` after `author` saved it over `oldContent`. */
export function updateBlame(
  oldContent: string,
  oldRuns: BlameRun[] | null,
  newContent: string,
  author: string,
  at: number,
): BlameRun[] {
  const oldLines = splitLines(oldContent)
  const newLines = splitLines(newContent)
  let oldAuthors = oldRuns ? expand(oldRuns) : []
  // Missing or inconsistent blame (older data, external tools): attribute old lines to nobody
  // in particular rather than failing.
  if (oldAuthors.length !== oldLines.length) {
    oldAuthors = oldLines.map(() => ({ author, at }))
  }

  const result: LineAuthor[] = []
  let oldIndex = 0
  const changes = diffArrays(oldLines.map(normalizeLine), newLines.map(normalizeLine))
  for (const change of changes) {
    const count = change.count ?? change.value.length
    if (change.removed) {
      oldIndex += count
    } else if (change.added) {
      for (let i = 0; i < count; i++) result.push({ author, at })
    } else {
      for (let i = 0; i < count; i++) result.push(oldAuthors[oldIndex + i] ?? { author, at })
      oldIndex += count
    }
  }
  return compress(result)
}

export function runsToRanges(runs: BlameRun[]): BlameRange[] {
  const ranges: BlameRange[] = []
  let start = 0
  for (const [count, author, at] of runs) {
    ranges.push({ start, count, author, at })
    start += count
  }
  return ranges
}

export function parseBlame(json: string | null): BlameRun[] | null {
  if (!json) return null
  try {
    const value: unknown = JSON.parse(json)
    return Array.isArray(value) ? (value as BlameRun[]) : null
  } catch {
    return null
  }
}
