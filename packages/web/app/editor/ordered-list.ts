// Numbered lists, with TipTap's own Markdown parser (@tiptap/extension-list 3.32, not exported:
// copied here) and one change. TipTap collects every numbered line under a numbered item as a
// sub-item, whatever sits between: in
//
//   1. dq
//      - [ ] Hello
//        1. TADA
//
// "TADA" became a sub-item of "dq" next to the to-do list, instead of one of "Hello": the note
// came back different after a save. Here a numbered line deeper than a bullet or to-do line of
// the item belongs to that list (`nestedListIndent`). And an item's content starts after its
// whole marker (`contentIndent`). Keep in step with TipTap when upgrading.
import type { MarkdownLexerConfiguration, MarkdownToken } from '@tiptap/core'
import {
  OrderedList,
  ORDERED_LIST_MARKER_PATTERN,
  detectMarkerType,
  markerToStart,
} from '@tiptap/extension-list'

const ORDERED_LIST_ITEM_REGEX = new RegExp(`^(\\s*)(${ORDERED_LIST_MARKER_PATTERN})([.)])\\s+(.*)$`)
const INDENTED_LINE_REGEX = /^\s/
const PARAGRAPH_INTERRUPTERS = {
  heading: /^#{1,6}(?:\s|$)/,
  bulletItem: /^[-+*]\s+/,
  codeFence: /^(?:```|~~~)/,
  blockMath: /^\$\$/,
  thematicBreak: /^(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/,
}

interface OrderedItem {
  indent: number
  number: number
  type: string | undefined
  contentLines: string[]
  raw: string
}

function isOrderedListMarkerLine(line: string): boolean {
  return ORDERED_LIST_ITEM_REGEX.test(line.trimStart())
}

function isBlockContentLine(line: string): boolean {
  const trimmed = line.trimStart()
  return (
    PARAGRAPH_INTERRUPTERS.bulletItem.test(trimmed) ||
    isOrderedListMarkerLine(trimmed) ||
    PARAGRAPH_INTERRUPTERS.heading.test(trimmed) ||
    (PARAGRAPH_INTERRUPTERS.thematicBreak.test(trimmed) && !trimmed.startsWith('-')) ||
    /^>\s?/.test(trimmed) ||
    PARAGRAPH_INTERRUPTERS.codeFence.test(trimmed) ||
    PARAGRAPH_INTERRUPTERS.blockMath.test(trimmed)
  )
}

function interruptsLazyContinuation(line: string): boolean {
  return Object.values(PARAGRAPH_INTERRUPTERS).some((pattern) => pattern.test(line))
}

function splitItemContent(contentLines: string[]) {
  const paragraphLines: string[] = []
  const blockLines: string[] = []
  let reachedBlockBoundary = false
  for (const line of contentLines) {
    if (reachedBlockBoundary) blockLines.push(line)
    else if (line.trim() === '' || (paragraphLines.length > 0 && isBlockContentLine(line))) {
      reachedBlockBoundary = true
      blockLines.push(line)
    } else paragraphLines.push(line)
  }
  return { paragraphLines, blockLines }
}

function collectOrderedListItems(lines: string[]): [OrderedItem[], number] {
  const items: OrderedItem[] = []
  let index = 0
  let consumed = 0
  while (index < lines.length) {
    const match = lines[index]!.match(ORDERED_LIST_ITEM_REGEX)
    if (!match) break
    const [, indent = '', marker = '', , content = ''] = match
    const indentLevel = indent.length
    const number = Number.parseInt(marker, 10)
    const contentLines = [content]
    const itemLines = [lines[index]!]
    // The indentation of a bullet or to-do line inside this item: deeper numbered lines are
    // that list's (the change from TipTap's parser).
    let nestedListIndent: number | null = null
    let sawBlankLine = false
    let next = index + 1
    while (next < lines.length) {
      const line = lines[next]!
      const lineIndent = line.length - line.trimStart().length
      const ordered = ORDERED_LIST_ITEM_REGEX.test(line)
      if (ordered && !(nestedListIndent !== null && lineIndent > nestedListIndent)) break
      if (line.trim() === '') {
        itemLines.push(line)
        contentLines.push('')
        sawBlankLine = true
      } else if (INDENTED_LINE_REGEX.test(line)) {
        // Where the item's text starts (TipTap counted the marker without its "." or ")": one
        // column short, a to-do list's second item read back as text in the first).
        const contentIndent = lines[index]!.length - content.length
        if (!ordered && PARAGRAPH_INTERRUPTERS.bulletItem.test(line.trimStart())) {
          nestedListIndent = lineIndent
        }
        itemLines.push(line)
        contentLines.push(line.slice(Math.min(lineIndent, contentIndent)))
      } else {
        if (sawBlankLine || interruptsLazyContinuation(line)) break
        itemLines.push(line)
        contentLines.push(line)
      }
      next += 1
    }
    items.push({
      indent: indentLevel,
      number: Number.isNaN(number) ? markerToStart(marker) : number,
      type: Number.isNaN(number) ? detectMarkerType(marker) : undefined,
      contentLines,
      raw: itemLines.join('\n'),
    })
    consumed = next
    index = next
  }
  return [items, consumed]
}

function buildNestedStructure(
  items: OrderedItem[],
  baseIndent: number,
  lexer: MarkdownLexerConfiguration,
): MarkdownToken[] {
  const result: MarkdownToken[] = []
  let index = 0
  while (index < items.length) {
    const item = items[index]!
    if (item.indent !== baseIndent) {
      index += 1
      continue
    }
    const { paragraphLines, blockLines } = splitItemContent(item.contentLines)
    const tokens: MarkdownToken[] = []
    const mainText = paragraphLines.join('\n').trim()
    if (mainText) {
      tokens.push({ type: 'paragraph', raw: mainText, tokens: lexer.inlineTokens(mainText) })
    }
    const additional = blockLines.join('\n').trim()
    if (additional) tokens.push(...lexer.blockTokens(additional))
    let lookAhead = index + 1
    const nested: OrderedItem[] = []
    while (lookAhead < items.length && items[lookAhead]!.indent > baseIndent) {
      nested.push(items[lookAhead]!)
      lookAhead += 1
    }
    if (nested.length > 0) {
      tokens.push({
        type: 'list',
        ordered: true,
        start: nested[0]!.number,
        typeMarker: nested[0]!.type,
        items: buildNestedStructure(nested, Math.min(...nested.map((n) => n.indent)), lexer),
        raw: nested.map((n) => n.raw).join('\n'),
      })
    }
    result.push({ type: 'list_item', raw: item.raw, tokens })
    index = lookAhead
  }
  return result
}

// Reads only the lines the list needs (as TipTap: notes can be long).
const SCAN_WINDOW = 64

function takeLines(source: string, max: number): string[] {
  const lines: string[] = []
  let start = 0
  while (lines.length < max) {
    const end = source.indexOf('\n', start)
    if (end === -1) {
      lines.push(source.slice(start))
      return lines
    }
    lines.push(source.slice(start, end))
    start = end + 1
  }
  return lines
}

function collectFromSource(source: string): [OrderedItem[], number, string[]] {
  const firstLineEnd = source.indexOf('\n')
  const firstLine = firstLineEnd === -1 ? source : source.slice(0, firstLineEnd)
  if (!ORDERED_LIST_ITEM_REGEX.test(firstLine)) return [[], 0, []]
  let window = SCAN_WINDOW
  let lines = takeLines(source, window)
  let [items, consumed] = collectOrderedListItems(lines)
  while (consumed === lines.length && lines.length === window) {
    window *= 2
    lines = takeLines(source, window)
    ;[items, consumed] = collectOrderedListItems(lines)
  }
  return [items, consumed, lines]
}

export const NestedOrderedList = OrderedList.extend({
  markdownTokenizer: {
    name: 'orderedList',
    level: 'block',
    start: () => -1,
    tokenize: (src, _tokens, lexer) => {
      const [items, consumed, lines] = collectFromSource(src)
      if (items.length === 0) return
      const listItems = buildNestedStructure(items, items[0]!.indent, lexer)
      if (listItems.length === 0) return
      return {
        type: 'list',
        ordered: true,
        start: items[0]!.number || 1,
        typeMarker: items[0]!.type,
        items: listItems,
        raw: lines.slice(0, consumed).join('\n'),
      }
    },
  },
})
