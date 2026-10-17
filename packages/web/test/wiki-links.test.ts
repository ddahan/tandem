// @vitest-environment happy-dom
// Wiki links to notes that don't exist look different (decoration), and follow the tree.
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions, starterKitOptions } from '../app/editor/extensions'
import { wikiLinkStatusKey } from '../app/editor/wiki-link'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

describe('links to missing notes', () => {
  it('marks them, and updates when the tree changes', () => {
    const existing = new Set(['here'])
    editor = new Editor({
      extensions: [
        StarterKit.configure(starterKitOptions),
        Markdown,
        ...createExtensions({ wikiLinkExists: (target) => existing.has(target.toLowerCase()) }),
      ],
      content: 'See [[Here]] and [[Not yet]].',
      contentType: 'markdown',
    })
    const missing = () =>
      [...editor!.view.dom.querySelectorAll('.wiki-link--missing')].map((a) => a.textContent)
    expect(missing()).toEqual(['Not yet'])

    // The note gets created: the app tells the editor to check its links again.
    existing.add('not yet')
    editor.view.dispatch(editor.state.tr.setMeta(wikiLinkStatusKey, true))
    expect(missing()).toEqual([])
    // The Markdown is unchanged: it's only a look.
    expect(editor.getMarkdown().trim()).toBe('See [[Here]] and [[Not yet]].')
  })
})
