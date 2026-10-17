// Links to attachments (`Note.assets/…`) are shown as file chips: the file type's icon, the
// file name, a pill, and a click downloads the file. The Markdown stays a plain link; only the
// display changes (decorations).
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { fileIconCssUrl } from '../utils/file-icons'

export function isAttachmentHref(href: string): boolean {
  return /\.assets\/[^/]+$/.test(href)
}

/** Downloads a file of the data folder (same origin, so the `download` attribute applies). */
export function downloadFile(href: string): void {
  const name = decodeURIComponent(href.split(/[?#]/)[0]?.split('/').pop() ?? '')
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
}

/**
 * Where the chips are: each attachment link's whole text (a link split over several text
 * nodes, some of it bold, is one chip). Other decorations over part of a chip would cut it
 * into several pills: they cover the whole chip instead (find, in find.ts).
 */
export function chipRanges(doc: ProseMirrorNode): { from: number; to: number }[] {
  const ranges: { from: number; to: number; href: string }[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const href = node.marks.find((mark) => mark.type.name === 'link')?.attrs.href as
      | string
      | undefined
    if (!href || !isAttachmentHref(href)) return
    const last = ranges.at(-1)
    if (last && last.href === href && last.to === pos) last.to = pos + node.nodeSize
    else ranges.push({ from: pos, to: pos + node.nodeSize, href })
  })
  return ranges.map(({ from, to }) => ({ from, to }))
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
          : { class: 'file-chip', style: `--file-icon: ${fileIconCssUrl(href)}` },
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
          handleDOMEvents: {
            // A chip is a button: a click downloads the file (without moving the cursor there).
            mousedown(_view, event) {
              if (event.button !== 0) return false
              const chip = (event.target as Element | null)?.closest?.('.file-chip')
              const href = chip?.closest('a')?.getAttribute('href')
              if (!href || !isAttachmentHref(href)) return false
              event.preventDefault()
              downloadFile(href)
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
