// Collapsible sections, stored as HTML `<details>` (GitHub renders them, agents read them):
//   <details>
//   <summary>Title</summary>
//
//   Markdown content
//
//   </details>
import { Details as BaseDetails, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import type { JSONContent } from '@tiptap/core'

/** Finds the `</details>` closing the one opening `src` (nested sections allowed). */
function closingIndex(src: string): number {
  const tags = /<(\/?)details\b[^>]*>/gi
  let depth = 0
  for (const match of src.matchAll(tags)) {
    depth += match[1] ? -1 : 1
    if (depth === 0) return match.index + match[0].length
  }
  return -1
}

export const Details = BaseDetails.extend({
  markdownTokenizer: {
    name: 'details',
    level: 'block',
    start: (src: string) => {
      const match = /^ {0,3}<details\b/im.exec(src)
      return match ? match.index : -1
    },
    tokenize(src: string, _tokens, lexer) {
      if (!/^ {0,3}<details\b/i.test(src)) return undefined
      const end = closingIndex(src)
      if (end === -1) return undefined
      const raw = src.slice(0, end) + (/^[ \t]*\n/.exec(src.slice(end))?.[0] ?? '')
      const inner = src.slice(src.indexOf('>') + 1, end).replace(/<\/details>$/i, '')
      const summary = /^\s*<summary>([\s\S]*?)<\/summary>/i.exec(inner)
      const body = summary ? inner.slice(summary[0].length) : inner
      return {
        type: 'details',
        raw,
        open: /^ {0,3}<details\b[^>]*\bopen\b/i.test(src),
        summaryTokens: lexer.inlineTokens(summary?.[1]?.trim() ?? ''),
        tokens: lexer.blockTokens(body.trim()),
      }
    },
  },

  parseMarkdown(token, helpers) {
    const content = helpers.parseChildren(token.tokens ?? [])
    return helpers.createNode('details', { open: Boolean(token.open) }, [
      helpers.createNode(
        'detailsSummary',
        {},
        helpers.parseInline((token.summaryTokens as never[]) ?? []),
      ),
      helpers.createNode(
        'detailsContent',
        {},
        content.length ? content : [helpers.createNode('paragraph')],
      ),
    ])
  },

  renderMarkdown(node, helpers) {
    const [summary, content] = (node.content ?? []) as JSONContent[]
    const title = summary ? helpers.renderChildren(summary.content ?? []) : ''
    const body = content ? helpers.renderChildren(content.content ?? [], '\n\n') : ''
    return `<details>\n<summary>${title}</summary>\n\n${body}\n\n</details>`
  },
})

export { DetailsContent, DetailsSummary }
