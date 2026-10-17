// Links between notes: `[[Target]]`, `[[Target|label]]` or `[[Target#Heading]]`. The target is
// a title (`Foo`) or a path without `.md` (`Projects/Foo`) when titles are ambiguous.

export interface WikiLink {
  /** As written, without label nor heading. */
  target: string
  label: string | null
  heading: string | null
  /** Offsets of the whole `[[…]]` in the scanned text. */
  start: number
  end: number
}

const WIKI_LINK = /\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]/g

/** Wiki links of a Markdown text, ignoring those inside code (fenced blocks and inline code). */
export function parseWikiLinks(markdown: string): WikiLink[] {
  const links: WikiLink[] = []
  const masked = maskCode(markdown)
  for (const match of masked.matchAll(WIKI_LINK)) {
    const start = match.index
    const raw = markdown.slice(start, start + match[0].length)
    const inner = raw.slice(2, -2)
    const [beforeLabel = '', label] = splitOnce(inner, '|')
    const [target = '', heading] = splitOnce(beforeLabel, '#')
    if (!target.trim()) continue
    links.push({
      target: target.trim(),
      label: label?.trim() ?? null,
      heading: heading?.trim() ?? null,
      start,
      end: start + match[0].length,
    })
  }
  return links
}

/** Key used to compare link targets with titles and paths: case and accents ignored. */
export function linkKey(target: string): string {
  return target
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\.md$/, '')
    .trim()
}

/**
 * Rewrites the links whose target matches `from` (a title or a path without `.md`) to `to`,
 * keeping labels and headings. Returns the text unchanged when nothing matches.
 */
export function rewriteWikiLinks(markdown: string, from: string, to: string): string {
  const key = linkKey(from)
  const links = parseWikiLinks(markdown).filter((link) => linkKey(link.target) === key)
  let result = markdown
  for (const link of links.toReversed()) {
    const heading = link.heading === null ? '' : `#${link.heading}`
    const label = link.label === null ? '' : `|${link.label}`
    result = `${result.slice(0, link.start)}[[${to}${heading}${label}]]${result.slice(link.end)}`
  }
  return result
}

function splitOnce(text: string, separator: string): [string, string | undefined] {
  const index = text.indexOf(separator)
  return index === -1 ? [text, undefined] : [text.slice(0, index), text.slice(index + 1)]
}

const blank = (text: string) => text.replace(/[^\n]/g, ' ')

/** Replaces code (fenced blocks and inline code spans) with spaces, keeping offsets. */
export function maskCode(markdown: string): string {
  return markdown
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, blank)
    .replace(/(`+)[^`\n][\s\S]*?\1/g, blank)
}
