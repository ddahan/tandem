// What the editor would lose of a note's Markdown. Any text is valid Markdown, but the editor
// keeps only what it can show: an HTML comment goes, a raw HTML tag (<span style>, <kbd>, <sup>…)
// leaves only its text. The note would lose them at its first edit in the editor, so the
// Markdown view says so and the editor opens read-only. Harmless rewrites (`*` bullets as `-`,
// `__bold__` as `**bold**`, padded tables, a missing closing ```) don't count: the words and
// the HTML tags before and after a trip through the editor are compared.
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { createExtensions, starterKitOptions } from '../editor/extensions'
import { fromEditorMarkdown, normalizeMarkdown, toEditorMarkdown } from './markdown-paths'

export interface Loss {
  /** 1-based line of the note. */
  line: number
  /** That line, as written. */
  text: string
  /** What goes, said for people: "an HTML comment", "HTML <span>", or the words. */
  what: string
}

/** The Markdown as the editor would save it after an edit (the same parser as the editor's). */
export function editorRoundTrip(markdown: string, notePath: string): string {
  const editor = new Editor({
    extensions: [
      StarterKit.configure(starterKitOptions),
      Markdown.configure({ markedOptions: { gfm: true } }),
      ...createExtensions(),
    ],
    content: toEditorMarkdown(markdown, notePath),
    contentType: 'markdown',
  })
  try {
    return normalizeMarkdown(fromEditorMarkdown(editor.getMarkdown(), notePath))
  } finally {
    editor.destroy()
  }
}

// Tags the editor turns into its own nodes: their meaning stays.
const KEPT_TAGS = new Set(['br', 'img', 'details', 'summary'])
// A tag's name ends with a space, `/` or `>`: `<https://…>` is an autolink, not a tag.
const TAG = /<!--|<([a-z][a-z0-9-]*)(?=[\s/>])[^>]*>/gi
const WORD = /[\p{L}\p{N}]+/gu
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function tagsOf(line: string): string[] {
  return [...line.matchAll(TAG)]
    .map((match) => (match[0] === '<!--' ? '<!--' : match[1]!.toLowerCase()))
    .filter((tag) => !KEPT_TAGS.has(tag))
}

/** The line's words, outside HTML tags (whose names and attributes aren't text). */
function wordsOf(line: string): string[] {
  const text = line
    // List markers: the editor renumbers lists (`1.` `1.` `1.` as `1.` `2.` `3.`).
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ' ')
    .replace(/<\/?[a-z][a-z0-9-]*(?=[\s/>])[^>]*>|<!--|-->/gi, ' ')
    // Reference links' labels: the editor writes the links inline, with their URL.
    .replace(/^ {0,3}\[[^\]]+\]:/, ' ')
    .replace(/\]\[[^\]]*\]/g, ']')
    .replace(/&(#\d+|[a-z]+);/gi, (entity, name: string) =>
      name.startsWith('#')
        ? String.fromCodePoint(Number(name.slice(1)))
        : (ENTITIES[name] ?? entity),
    )
  return text.toLowerCase().match(WORD) ?? []
}

/** Counts, as a multiset. */
function bag(items: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return counts
}

/** Takes one of `item` from the bag: false when there is none left. */
function take(counts: Map<string, number>, item: string): boolean {
  const count = counts.get(item) ?? 0
  if (!count) return false
  counts.set(item, count - 1)
  return true
}

/**
 * The lines of `before` with words or HTML tags that `after` (its trip through the editor) no
 * longer has, in order. Empty: nothing is lost.
 */
export function lostLines(before: string, after: string): Loss[] {
  const words = bag(wordsOf(after))
  const tags = bag(tagsOf(after))
  const losses: Loss[] = []
  before.split('\n').forEach((text, index) => {
    const lostTags = tagsOf(text).filter((tag) => !take(tags, tag))
    const lostWords = wordsOf(text).filter((word) => !take(words, word))
    if (!lostTags.length && !lostWords.length) return
    const html = [...new Set(lostTags)].filter((tag) => tag !== '<!--')
    const what = [
      lostTags.includes('<!--') && 'an HTML comment',
      html.length > 0 && `HTML ${html.map((tag) => `<${tag}>`).join(', ')}`,
      !lostTags.length && `“${lostWords.slice(0, 5).join(' ')}”`,
    ]
      .filter(Boolean)
      .join(', ')
    losses.push({ line: index + 1, text, what })
  })
  return losses
}

/** What the editor would lose of this note's Markdown (see lostLines). */
export function markdownLosses(markdown: string, notePath: string): Loss[] {
  return lostLines(markdown, editorRoundTrip(markdown, notePath))
}
