// Plain text of a Markdown note, for the search index and its snippets: the words a reader
// sees, without Markdown syntax, URLs or HTML tags. Regex-based on purpose: fast, and exact
// enough for searching.

export function markdownToText(markdown: string): string {
  return (
    markdown
      // Database and bookmark blocks: only an id (their text is in Tandem, not in the note).
      .replace(/^```(?:database|bookmark)[ \t]*\n[\s\S]*?^```[ \t]*$/gm, '')
      // Code fences: keep the code, drop the fence lines.
      .replace(/^(```|~~~).*$/gm, '')
      // Images and links: keep the alt text / label.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Wiki links: keep the label, or the target.
      .replace(
        /\[\[([^\]|]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g,
        (_, target: string, label?: string) => (label ?? target).trim(),
      )
      // Callout markers and HTML tags (details, summary, img…).
      .replace(/^\s*>\s*\[!\w+\]/gm, '')
      .replace(/<\/?[a-z][^>]*>/gi, ' ')
      // Block syntax at line starts: headings, quotes, list markers, task boxes.
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*>+\s?/gm, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '')
      // Tables: pipes and separator rows.
      .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/gm, '')
      .replace(/\|/g, ' ')
      // Emphasis and inline code markers.
      .replace(/(\*\*|__|~~|\*|_|`)/g, '')
      .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Escapes text for HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Lowercase, without accents: how the search index compares words. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}
