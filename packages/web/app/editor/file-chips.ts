// Links to attachments (`Note.assets/…`) are shown as file chips: the file type's icon, the
// file name, a pill. The Markdown stays a plain link; only the display changes (decorations).
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { fileIconCssUrl } from '../utils/file-icons'

/** How to open a file from its chip (a plain click places the cursor, to edit the link). */
const OPEN_HINT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? '⌘ + click to open'
    : 'Ctrl + click to open'

export function isAttachmentHref(href: string): boolean {
  return /\.assets\/[^/]+$/.test(href)
}

function decorations(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = []
  // A link split over several text nodes (some of it bold…) gets one icon, on its first part.
  let previous: { href: string; end: number } | null = null
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const link = node.marks.find((mark) => mark.type.name === 'link')
    const href = link?.attrs.href as string | undefined
    if (!href || !isAttachmentHref(href)) {
      previous = null
      return
    }
    const continued = previous?.href === href && previous.end === pos
    found.push(
      Decoration.inline(
        pos,
        pos + node.nodeSize,
        continued
          ? { class: 'file-chip file-chip--continued' }
          : {
              class: 'file-chip',
              style: `--file-icon: ${fileIconCssUrl(href)}`,
              'data-hint': OPEN_HINT,
            },
      ),
    )
    previous = { href, end: pos + node.nodeSize }
  })
  return DecorationSet.create(doc, found)
}

export const FileChips = Extension.create({
  name: 'fileChips',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('fileChips'),
        state: {
          init: (_, state) => decorations(state.doc),
          apply: (transaction, set) =>
            transaction.docChanged ? decorations(transaction.doc) : set,
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
          // Cmd/Ctrl-click opens links (a plain click places the cursor, to edit them).
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
