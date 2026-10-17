// Read-only rendering of Markdown (authorship view, history preview): marked, with wiki links,
// attachment paths made absolute, and the HTML sanitized (notes can be written by anyone).
import { Marked } from 'marked'
import { toEditorMarkdown } from './markdown-paths'

const CALLOUT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/i

const marked = new Marked({
  gfm: true,
  renderer: {
    // GitHub callouts: `> [!TIP]` quotes.
    blockquote(token) {
      const match = CALLOUT.exec(token.text)
      if (!match) return false
      const type = match[1]!.toLowerCase()
      const inner = this.parser.parse(marked.lexer(token.text.replace(CALLOUT, '')))
      return `<div class="callout" data-callout="${type}"><p class="callout-title">${type}</p>${inner}</div>`
    },
  },
  extensions: [
    {
      name: 'wikiLink',
      level: 'inline',
      start: (src: string) => src.indexOf('[['),
      tokenizer(src: string) {
        const match = /^\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]/.exec(src)
        if (!match) return undefined
        return {
          type: 'wikiLink',
          raw: match[0],
          target: match[1]!.trim(),
          label: match[3]?.trim(),
        }
      },
      renderer(token) {
        const text = String(token.label || token.target)
        return `<span class="wiki-link text-primary font-medium">${escape(text)}</span>`
      },
    },
  ],
})

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const FORBIDDEN_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'FORM',
  'BUTTON',
  'LINK',
  'META',
  'BASE',
])

/** Removes scripts, event handlers and `javascript:` URLs. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const element of doc.body.querySelectorAll('*')) {
    // Task list checkboxes are the only inputs kept, disabled.
    const isCheckbox = element.tagName === 'INPUT' && element.getAttribute('type') === 'checkbox'
    if (FORBIDDEN_TAGS.has(element.tagName) || (element.tagName === 'INPUT' && !isCheckbox)) {
      element.remove()
      continue
    }
    // A copy: the attribute map is live, and attributes are removed while iterating.
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (
        name.startsWith('on') ||
        ((name === 'href' || name === 'src') &&
          /^(javascript|data|vbscript):/.test(value) &&
          !value.startsWith('data:image/'))
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  for (const checkbox of doc.body.querySelectorAll('input')) checkbox.setAttribute('disabled', '')
  return doc.body.innerHTML
}

export function renderMarkdown(markdown: string, notePath: string): string {
  return sanitizeHtml(marked.parse(toEditorMarkdown(markdown, notePath), { async: false }))
}
