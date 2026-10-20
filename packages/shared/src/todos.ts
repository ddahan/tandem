// TODOs in notes: `TODO:` in capitals, not glued to a word before it (`myTODO:` isn't one),
// up to the end of its line or the next TODO. Code (fenced blocks, inline code) never holds one.
// The editor highlights them with `todoRanges`, the TODOs page lists them with `findTodos`: the
// same rule, so both agree.
import { maskCode } from './wiki-links.ts'

export interface Todo {
  /** What follows `TODO:`, as plain text (Markdown formatting removed). */
  text: string
  /** Its line in the Markdown, from 1. */
  line: number
}

const MARKER = /(?<![\p{L}\p{N}_])TODO:/gu

/**
 * Where the TODOs of a text are: from `TODO:` to the end of its line (or to the next TODO),
 * trailing spaces left out. The text must have its code blanked (`maskCode`, or spaces).
 */
export function todoRanges(text: string): { start: number; end: number }[] {
  const starts = [...text.matchAll(MARKER)].map((match) => match.index)
  return starts.map((start, i) => {
    const lineEnd = text.indexOf('\n', start)
    let end = Math.min(lineEnd < 0 ? text.length : lineEnd, starts[i + 1] ?? text.length)
    while (end > start && /\s/.test(text[end - 1]!)) end--
    return { start, end }
  })
}

/** The TODOs of a Markdown note, in order. */
export function findTodos(markdown: string): Todo[] {
  if (!markdown.includes('TODO:')) return []
  const masked = maskCode(markdown)
  return todoRanges(masked).map(({ start, end }) => ({
    text: plainText(markdown.slice(start + 'TODO:'.length, end)),
    line: markdown.slice(0, start).split('\n').length,
  }))
}

/** Inline Markdown as it reads: links by their label, without emphasis marks or escapes. */
function plainText(markdown: string): string {
  return markdown
    .replace(/\[\[([^[\]|\n]+?)(?:#[^[\]|\n]*)?(?:\|([^[\]\n]*))?\]\]/g, (_, target, label) =>
      (label ?? target).trim(),
    )
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`+)/g, '')
    .replace(/(^|[^\p{L}\p{N}])[*_](\S(?:.*?\S)?)[*_](?![\p{L}\p{N}])/gu, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
