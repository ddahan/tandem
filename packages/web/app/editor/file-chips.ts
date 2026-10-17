// Links to attachments (`Note.assets/…`) are shown as file chips: an icon, the file name, a
// pill. The Markdown stays a plain link; only the display changes (decorations).
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export function isAttachmentHref(href: string): boolean {
  return /\.assets\/[^/]+$/.test(href)
}

function decorations(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const link = node.marks.find((mark) => mark.type.name === 'link')
    const href = link?.attrs.href as string | undefined
    if (!href || !isAttachmentHref(href)) return
    const extension = href.split('.').pop()?.toLowerCase() ?? ''
    found.push(
      Decoration.inline(pos, pos + node.nodeSize, {
        class: 'file-chip',
        'data-extension': extension,
      }),
    )
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
