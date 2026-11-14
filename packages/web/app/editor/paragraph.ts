// Paragraphs, whose empty ones (empty lines between the note's blocks) are kept: each is written
// `&nbsp;`, which TipTap reads back as an empty paragraph. TipTap writes the first of a row as a
// blank line instead (only the next ones as `&nbsp;`), and normalizeMarkdown keeps one blank
// line between blocks: one empty line was lost at each save. Those at the end of the note go
// (normalizeMarkdown): the editor keeps one there after a list or a table. Only the note's own
// blocks: in a list item, a quote or a callout, an empty paragraph is that item or block being
// empty, written as before.
import { Paragraph } from '@tiptap/extension-paragraph'

/** How an empty line between blocks is written in the Markdown. */
export const EMPTY_LINE = '&nbsp;'

export const NoteParagraph = Paragraph.extend({
  renderMarkdown(node, helpers, context) {
    const empty = !Array.isArray(node.content) || node.content.length === 0
    if (empty && context.parentType === 'doc') return EMPTY_LINE
    return this.parent?.(node, helpers, context) ?? ''
  },
})
