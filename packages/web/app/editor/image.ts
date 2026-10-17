// Images, resizable. A resized image is saved as HTML (`<img src="…" alt="…" width="320">`),
// since Markdown has no syntax for sizes; others stay `![alt](src)`.
import { Image } from '@tiptap/extension-image'

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const value = Number.parseInt(element.getAttribute('width') ?? '', 10)
          return Number.isFinite(value) ? value : null
        },
        renderHTML: (attributes) => (attributes.width ? { width: attributes.width as number } : {}),
      },
      height: { default: null, renderHTML: () => ({}) },
    }
  },

  renderMarkdown(node) {
    const {
      src = '',
      alt = '',
      title = '',
      width,
    } = (node.attrs ?? {}) as Record<string, string | number | null>
    if (width) {
      const titlePart = title ? ` title="${escapeAttribute(String(title))}"` : ''
      return `<img src="${escapeAttribute(String(src))}" alt="${escapeAttribute(String(alt ?? ''))}"${titlePart} width="${Math.round(Number(width))}">`
    }
    return title ? `![${alt ?? ''}](${src} "${title}")` : `![${alt ?? ''}](${src})`
  },
}).configure({
  inline: false,
  allowBase64: false,
  resize: {
    enabled: true,
    directions: ['bottom-right', 'bottom-left'],
    minWidth: 48,
    alwaysPreserveAspectRatio: true,
  },
})
