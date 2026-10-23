// Links to attachments (`Note.assets/…`) are shown as file chips: the file type's icon, the
// file name, a pill, and a click opens the file. The Markdown stays a plain link: the link
// itself is drawn as the chip (FileLink below), so other decorations (find's highlights) sit
// inside one chip instead of cutting it into pieces.
import { Extension } from '@tiptap/core'
import { Link } from '@tiptap/extension-link'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { fileIconCssUrl } from '../utils/file-icons'

export function isAttachmentHref(href: string): boolean {
  return /\.assets\/[^/]+$/.test(href)
}

/** Opens a file in a new tab, as the Files panel does: the browser shows what it can (PDF,
 * image, video, text) and downloads the rest. */
export function openFile(href: string): void {
  window.open(href, '_blank', 'noopener')
}

/**
 * The note's own attachments its document links to or shows (file chips, images), by file
 * name: their editor addresses start with `prefix` (`/files/<folder>/<title>.assets/`).
 */
export function attachmentNames(doc: ProseMirrorNode, prefix: string): Set<string> {
  const names = new Set<string>()
  const add = (href: unknown) => {
    if (typeof href !== 'string' || !href.startsWith(prefix)) return
    const rest = href.slice(prefix.length)
    if (!rest || rest.includes('/')) return
    try {
      names.add(decodeURIComponent(rest))
    } catch {
      names.add(rest)
    }
  }
  doc.descendants((node) => {
    if (node.type.name === 'image') add(node.attrs.src)
    for (const mark of node.marks) if (mark.type.name === 'link') add(mark.attrs.href)
  })
  return names
}

/** Whether a transaction may have removed content (a step replacing a range), cheaply. */
export function removesContent(tr: Transaction): boolean {
  return tr.steps.some((step) => {
    const range = step as unknown as { from?: number; to?: number }
    return typeof range.from === 'number' && typeof range.to === 'number' && range.to > range.from
  })
}

/** The link, drawn as a chip (class and the file type's icon) when it points to an attachment. */
export const FileLink = Link.extend({
  renderHTML(props) {
    // The parent's rendering keeps its checks (unsafe URLs are dropped).
    const [tag, attributes, hole] = this.parent!(props) as [string, Record<string, unknown>, 0]
    const href = attributes.href
    if (typeof href !== 'string' || !isAttachmentHref(href)) return [tag, attributes, hole]
    return [
      tag,
      { ...attributes, class: 'file-chip', style: `--file-icon: ${fileIconCssUrl(href)}` },
      hole,
    ]
  },
})

export const FileChips = Extension.create({
  name: 'fileChips',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('fileChips'),
        props: {
          handleDOMEvents: {
            // A chip is a button: a click opens the file (without moving the cursor there).
            mousedown(_view, event) {
              if (event.button !== 0) return false
              const chip = (event.target as Element | null)?.closest?.('a.file-chip')
              const href = chip?.getAttribute('href')
              if (!href || !isAttachmentHref(href)) return false
              event.preventDefault()
              openFile(href)
              return true
            },
          },
          // Cmd/Ctrl-click opens other links (a plain click places the cursor, to edit them).
          handleClick(view, pos, event) {
            if (!(event.metaKey || event.ctrlKey)) return false
            const link = view.state.doc
              .resolve(pos)
              .marks()
              .find((mark) => mark.type.name === 'link')
            const href = link?.attrs.href as string | undefined
            if (!href) return false
            window.open(href, '_blank', 'noopener')
            return true
          },
        },
      }),
    ]
  },
})
