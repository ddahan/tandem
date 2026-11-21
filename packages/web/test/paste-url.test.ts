// @vitest-environment happy-dom
// A web address pasted alone: handed to the note (⌘V, a bookmark's card), a link with ⌘⇧V.
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { Slice } from '@tiptap/pm/model'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExtensions, starterKitOptions } from '../app/editor/extensions'
import { pastedUrl } from '../app/editor/paste-url'

let current: Editor | null = null
afterEach(() => current?.destroy())

type OnPasteUrl = (editor: Editor, url: string, pos: number) => boolean

function setup(markdown: string, onPasteUrl = vi.fn<OnPasteUrl>(() => true)) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure(starterKitOptions),
      Markdown,
      ...createExtensions({ onPasteUrl }),
    ],
    content: markdown,
    contentType: 'markdown',
  })
  current = editor
  return { editor, onPasteUrl }
}

/** A paste through the editor's handlers, after the keys that made it (⌘V or ⌘⇧V). */
function paste(e: Editor, text: string, shift = false) {
  const keys = new KeyboardEvent('keydown', {
    key: shift ? 'V' : 'v',
    metaKey: true,
    shiftKey: shift,
  })
  e.view.someProp('handleKeyDown', (handle) => handle(e.view, keys))
  const event = {
    clipboardData: { files: [], getData: (type: string) => (type === 'text/plain' ? text : '') },
  } as unknown as ClipboardEvent
  return !!e.view.someProp('handlePaste', (handle) => handle(e.view, event, Slice.empty))
}

describe('pastedUrl', () => {
  it('takes a web address written in full, alone', () => {
    expect(pastedUrl('  https://example.com/a?b=1 \n')).toBe('https://example.com/a?b=1')
    expect(pastedUrl('http://example.com')).toBe('http://example.com/')
  })

  it('leaves anything else', () => {
    expect(pastedUrl('example.com')).toBeNull()
    expect(pastedUrl('see https://example.com')).toBeNull()
    expect(pastedUrl('https://a.com https://b.com')).toBeNull()
    expect(pastedUrl('ftp://example.com')).toBeNull()
    expect(pastedUrl('mailto:me@example.com')).toBeNull()
  })
})

describe('pasting an address', () => {
  it('hands it to the note with ⌘V, where the cursor is', () => {
    const { editor, onPasteUrl } = setup('Hello')
    editor.commands.setTextSelection(3)
    expect(paste(editor, 'https://example.com')).toBe(true)
    expect(onPasteUrl).toHaveBeenCalledWith(editor, 'https://example.com/', 3)
  })

  it('leaves it to the editor (a link) with ⌘⇧V', () => {
    const { editor, onPasteUrl } = setup('Hello')
    expect(paste(editor, 'https://example.com', true)).toBe(false)
    expect(onPasteUrl).not.toHaveBeenCalled()
    // The next ⌘V is a bookmark again.
    expect(paste(editor, 'https://example.com')).toBe(true)
  })

  it('leaves it to the editor when the note doesn’t take it (bookmarks off)', () => {
    const { editor } = setup(
      'Hello',
      vi.fn<OnPasteUrl>(() => false),
    )
    expect(paste(editor, 'https://example.com')).toBe(false)
  })

  it('leaves text, a selection and code to the editor', () => {
    const { editor, onPasteUrl } = setup('Hello `code`\n\n```\nblock\n```')
    expect(paste(editor, 'see https://example.com')).toBe(false)
    editor.commands.setTextSelection({ from: 1, to: 6 })
    expect(paste(editor, 'https://example.com')).toBe(false)
    editor.commands.setTextSelection(9)
    expect(paste(editor, 'https://example.com')).toBe(false)
    let inBlock = 0
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'codeBlock') inBlock = pos + 2
    })
    editor.commands.setTextSelection(inBlock)
    expect(paste(editor, 'https://example.com')).toBe(false)
    expect(onPasteUrl).not.toHaveBeenCalled()
  })
})
