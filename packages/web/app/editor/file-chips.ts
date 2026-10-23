// Links to attachments (`Note.assets/…`) are shown as file chips: the file type's icon, the
// file name, a pill, and a click opens the file. The Markdown stays a plain link: the link
// itself is drawn as the chip (FileLink below), so other decorations (find's highlights) sit
// inside one chip instead of cutting it into pieces.
import { Extension } from '@tiptap/core'
import { Link } from '@tiptap/extension-link'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { fileIconCssUrl } from '../utils/file-icons'

export function isAttachmentHref(href: string): boolean {
  return /\.assets\/[^/]+$/.test(href)
}

/** Opens a file in a new tab, as the Files panel does: the browser shows what it can (PDF,
 * image, video, text) and downloads the rest. */
export function openFile(href: string): void {
  window.open(href, '_blank', 'noopener')
}

/** A file's name from its editor address, when it is one of the note's own (`prefix`). */
function nameOf(href: unknown, prefix: string): string | null {
  if (typeof href !== 'string' || !href.startsWith(prefix)) return null
  const rest = href.slice(prefix.length)
  if (!rest || rest.includes('/')) return null
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}

/**
 * The note's own attachments its document links to or shows (file chips, images), by file
 * name: their editor addresses start with `prefix` (`/files/<folder>/<title>.assets/`).
 */
export function attachmentNames(doc: ProseMirrorNode, prefix: string): Set<string> {
  const names = new Set<string>()
  const add = (href: unknown) => {
    const name = nameOf(href, prefix)
    if (name) names.add(name)
  }
  doc.descendants((node) => {
    if (node.type.name === 'image') add(node.attrs.src)
    for (const mark of node.marks) if (mark.type.name === 'link') add(mark.attrs.href)
  })
  return names
}

/** A transaction taking out of the document every image and chip of these files, or null. */
export function removeFiles(
  state: EditorState,
  names: ReadonlySet<string>,
  prefix: string,
): Transaction | null {
  const ranges: { from: number; to: number }[] = []
  state.doc.descendants((node, pos) => {
    const gone =
      (node.type.name === 'image' && names.has(nameOf(node.attrs.src, prefix) ?? '')) ||
      node.marks.some(
        (mark) => mark.type.name === 'link' && names.has(nameOf(mark.attrs.href, prefix) ?? ''),
      )
    if (gone) ranges.push({ from: pos, to: pos + node.nodeSize })
  })
  if (!ranges.length) return null
  const tr = state.tr
  for (const { from, to } of ranges.toReversed()) tr.delete(from, to)
  return tr
}

/** Content replaced from outside (setContent), or a change another extension appended to it. */
export function isFromOutside(tr: Transaction): boolean {
  const root = tr.getMeta('appendedTransaction') as Transaction | undefined
  return !!tr.getMeta('preventUpdate') || !!root?.getMeta('preventUpdate')
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

/** The files deleted for good while the note is open (by name), in the editor's state. */
export const deletedFilesKey = new PluginKey<ReadonlySet<string>>('deletedFiles')

/** Marks files as deleted (`deleted`), or as there again (`restored`: one uploaded anew). */
export interface DeletedFilesMeta {
  deleted?: string[]
  restored?: string[]
}

/** The names of the files deleted for good while the note is open. */
export function deletedFiles(state: EditorState): ReadonlySet<string> {
  return deletedFilesKey.getState(state) ?? new Set()
}

/**
 * A file deleted for good can't come back in the note: undo, redo or a paste that would bring
 * back one of its images or chips is followed by their removal (the rest of the change stays).
 * Content replaced from outside (setContent: the file on disk, an agent) is the note's: a file
 * it links to is there again (a new one under that name), no longer deleted.
 *
 * The removal is a change of its own, once the view has the new state, out of the undo
 * history: appended to an undo, it would leave the history's other steps unmapped
 * (prosemirror-history doesn't map them through it), and the next undo would miss its text.
 */
export const DeletedFiles = Extension.create<{ prefix: () => string }>({
  name: 'deletedFiles',

  addOptions() {
    return { prefix: () => '' }
  },

  addProseMirrorPlugins() {
    const { prefix } = this.options
    return [
      new Plugin<ReadonlySet<string>>({
        key: deletedFilesKey,
        state: {
          init: () => new Set(),
          apply(tr, names) {
            const meta = tr.getMeta(deletedFilesKey) as DeletedFilesMeta | undefined
            const restored = [...(meta?.restored ?? [])]
            if (names.size && tr.docChanged && isFromOutside(tr)) {
              restored.push(...attachmentNames(tr.doc, prefix()))
            }
            const added = meta?.deleted ?? []
            if (!added.length && !restored.some((name) => names.has(name))) return names
            const next = new Set(names)
            for (const name of added) next.add(name)
            for (const name of restored) next.delete(name)
            return next
          },
        },
        view() {
          let checked: ProseMirrorNode | null = null
          return {
            update(view) {
              const { doc } = view.state
              if (doc === checked) return
              checked = doc
              const names = deletedFiles(view.state)
              if (!names.size) return
              const tr = removeFiles(view.state, names, prefix())
              if (tr) view.dispatch(tr.setMeta('addToHistory', false))
            },
          }
        },
      }),
    ]
  },
})
