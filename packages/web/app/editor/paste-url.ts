// A web address pasted alone (⌘V) is handed to the note, which shows it as a bookmark's card;
// ⌘⇧V pastes it as a link, as does any paste the note doesn't take (bookmarks off, a selection
// to turn into a link, inside a code block or inline code, more than an address).
// ProseMirror's handlePaste doesn't say whether Shift was held, so the ⌘V key is watched.
import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { webUrl } from '@tandem/shared'

export interface PasteUrlOptions {
  /** A web address pasted at `pos`; returns whether it was taken (nothing else is pasted). */
  onPasteUrl: (editor: Editor, url: string, pos: number) => boolean
}

/** The address a pasted text is, when it is only that (http or https, written in full). */
export function pastedUrl(text: string): string | null {
  const trimmed = text.trim()
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null
  return webUrl(trimmed)
}

export const PasteUrl = Extension.create<PasteUrlOptions>({
  name: 'pasteUrl',
  // Before the link extension's paste handler, which would make it a link.
  priority: 1100,

  addOptions() {
    return { onPasteUrl: () => false }
  },

  addProseMirrorPlugins() {
    const { onPasteUrl } = this.options
    const editor = this.editor
    // Whether the last paste shortcut held Shift (⌘⇧V: as a link, plain).
    let plain = false
    return [
      new Plugin({
        key: new PluginKey('pasteUrl'),
        props: {
          handleKeyDown(_view, event) {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
              plain = event.shiftKey
            }
            return false
          },
          handlePaste(view, event) {
            const asLink = plain
            plain = false
            if (asLink) return false
            const data = event.clipboardData
            if (!data || data.files.length) return false
            const url = pastedUrl(data.getData('text/plain'))
            if (!url) return false
            const { selection } = view.state
            if (!selection.empty) return false
            const { $from } = selection
            if ($from.parent.type.spec.code) return false
            if ($from.marks().some((mark) => mark.type.spec.code)) return false
            return onPasteUrl(editor, url, selection.from)
          },
        },
      }),
    ]
  },
})
