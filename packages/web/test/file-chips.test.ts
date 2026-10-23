// @vitest-environment happy-dom
// The note's own attachments its document links to (file chips) or shows (images).
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, expect, it } from 'vitest'
import { createExtensions, starterKitOptions } from '../app/editor/extensions'
import { attachmentNames } from '../app/editor/file-chips'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

it('lists the attachments of the note’s own folder, by name', () => {
  editor = new Editor({
    extensions: [StarterKit.configure(starterKitOptions), Markdown, ...createExtensions()],
    content:
      '[report 1.pdf](/files/A/My%20note.assets/report%201.pdf) ' +
      '[other](/files/A/Other.assets/x.pdf) [site](https://example.com)\n\n' +
      '![a](/files/A/My%20note.assets/a.png)',
    contentType: 'markdown',
  })
  expect([...attachmentNames(editor.state.doc, '/files/A/My%20note.assets/')]).toEqual([
    'report 1.pdf',
    'a.png',
  ])
})
