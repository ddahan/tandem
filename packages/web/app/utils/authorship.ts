// Groups a note's lines into display blocks (paragraphs, headings, list items, code blocks…)
// and gives each block the author who last changed one of its lines.
import { Lexer, type Token, type Tokens } from 'marked'
import { EXTERNAL, OWNER, type BlameRange } from '@myfluence/shared'

export interface AuthoredBlock {
  markdown: string
  author: string
  at: number
  startLine: number
  lineCount: number
}

export function blocksWithAuthors(content: string, blame: BlameRange[]): AuthoredBlock[] {
  const lineAuthors: { author: string; at: number }[] = []
  for (const range of blame) {
    for (let i = 0; i < range.count; i++) lineAuthors.push({ author: range.author, at: range.at })
  }

  // Line number of each character offset, to place tokens (their `raw` texts follow each
  // other in the source).
  const lineStarts = [0]
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') lineStarts.push(i + 1)
  const lineAt = (offset: number) => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (lineStarts[mid]! <= offset) low = mid
      else high = mid - 1
    }
    return low
  }

  const blocks: AuthoredBlock[] = []
  const push = (markdown: string, offset: number, raw: string) => {
    const leading = raw.length - raw.trimStart().length
    const startLine = lineAt(offset + leading)
    const endLine = lineAt(offset + raw.trimEnd().length - 1)
    const authors = lineAuthors.slice(startLine, endLine + 1)
    const latest = authors.reduce<{ author: string; at: number } | null>(
      (best, current) => (!best || current.at > best.at ? current : best),
      null,
    )
    blocks.push({
      markdown: markdown.trim(),
      author: latest?.author ?? EXTERNAL,
      at: latest?.at ?? 0,
      startLine,
      lineCount: endLine - startLine + 1,
    })
  }

  let offset = 0
  const tokens: Token[] = new Lexer({ gfm: true }).lex(content)
  for (const token of tokens) {
    const found = content.indexOf(token.raw, offset)
    const start = found === -1 ? offset : found
    if (token.type === 'list') {
      // List items one by one: they are often written by different authors.
      const list = token as Tokens.List
      let itemOffset = start
      list.items.forEach((item, index) => {
        const at = content.indexOf(item.raw, itemOffset)
        const itemStart = at === -1 ? itemOffset : at
        const markdown = list.ordered
          ? item.raw.replace(/^(\s*)\d+([.)])/, `$1${Number(list.start || 1) + index}$2`)
          : item.raw
        if (item.raw.trim()) push(markdown, itemStart, item.raw)
        itemOffset = itemStart + item.raw.length
      })
    } else if (token.type !== 'space' && token.raw.trim()) {
      push(token.raw, start, token.raw)
    }
    offset = start + token.raw.length
  }
  return blocks
}

const PALETTE = [
  '#f59e0b',
  '#10b981',
  '#0ea5e9',
  '#8b5cf6',
  '#f43f5e',
  '#14b8a6',
  '#ec4899',
  '#84cc16',
]

/** A stable color per author: the primary color for the owner, gray for external edits. */
export function authorColor(author: string): string {
  if (author === OWNER) return 'var(--ui-primary)'
  if (author === EXTERNAL) return 'var(--ui-text-dimmed)'
  let hash = 0
  for (const char of author) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}
