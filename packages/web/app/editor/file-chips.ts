// Links to attachments (`Note.assets/…`) are shown as file chips: the file type's icon, the
// file name, a pill, and a click downloads the file. The Markdown stays a plain link: the link
// itself is drawn as the chip (FileLink below), so other decorations (find's highlights) sit
// inside one chip instead of cutting it into pieces.
import { Extension } from '@tiptap/core'
import { Link } from '@tiptap/extension-link'
import { Plugin, PluginKey } from '@tiptap/pm/state'
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
            // A chip is a button: a click downloads the file (without moving the cursor there).
            mousedown(_view, event) {
              if (event.button !== 0) return false
              const chip = (event.target as Element | null)?.closest?.('a.file-chip')
              const href = chip?.getAttribute('href')
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
