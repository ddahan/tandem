// Images, resizable. A resized image is saved as HTML (`<img src="…" alt="…" width="320">`),
// since Markdown has no syntax for sizes; others stay `![alt](src)`. Its height follows its
// width (CSS: main.css), so it keeps its proportions, also when the column is narrower than the
// width it was given. A double click opens it (`onOpen`: the note shows it full screen).
import { Image, type ImageOptions } from '@tiptap/extension-image'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface OpenedImage {
  src: string
  alt: string
}

export interface ResizableImageOptions extends ImageOptions {
  /** An image double-clicked: to show it (nothing without). */
  onOpen?: (image: OpenedImage) => void
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export const ResizableImage = Image.extend<ResizableImageOptions>({
  addOptions() {
    return { ...this.parent!(), onOpen: undefined }
  },

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

  // TipTap's node view sets the width only when created (and while dragging): the width shown
  // follows the node's here, so that it is the one saved, after a resize (the drag could leave
  // it wider than the column allowed) or a change from outside (an agent's).
  addNodeView() {
    const create = this.parent?.()
    if (!create) return null
    return (props) => {
      const view = create(props)
      const update = view.update?.bind(view)
      if (!update) return view
      view.update = (node, ...rest) => {
        if (!update(node, ...rest)) return false
        const image = view.dom instanceof HTMLElement ? view.dom.querySelector('img') : null
        const width = node.attrs.width as number | null
        if (image) image.style.width = width ? `${width}px` : ''
        return true
      }
      return view
    }
  },

  addProseMirrorPlugins() {
    const open = () => this.options.onOpen
    return [
      new Plugin({
        key: new PluginKey('openImage'),
        props: {
          handleDOMEvents: {
            // On the image itself (its node view: the resize frame), not on other pictures a
            // note shows (a bookmark's icon, a diagram).
            dblclick(_view, event) {
              const onOpen = open()
              const target = event.target as Element | null
              const image = target?.closest?.('[data-resize-container] img')
              const src = image?.getAttribute('src')
              if (!onOpen || !src) return false
              event.preventDefault()
              onOpen({ src, alt: image?.getAttribute('alt') ?? '' })
              return true
            },
          },
        },
      }),
    ]
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
