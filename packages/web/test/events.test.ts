// @vitest-environment happy-dom
// Events typed in a daily note (editor/event.ts): a time and a space at the start of an empty
// line or to-do make an event being typed; an empty to-do's list is split around the event.
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions, markdownOptions, starterKitOptions } from '../app/editor/extensions'
import { placedEvents, replaceTodo, typingEvent } from '../app/editor/event'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function createEditor(markdown: string, date: string | null = '2026-10-24') {
  editor = new Editor({
    extensions: [
      StarterKit.configure(starterKitOptions),
      Markdown.configure(markdownOptions()),
      ...createExtensions({ date: () => date }),
    ],
    content: markdown,
    contentType: 'markdown',
  })
  return editor
}

/** The top-level blocks: their type, and their text or ref (the editor's last empty line left out). */
function blocks(): string[] {
  const list: string[] = []
  editor!.state.doc.forEach((node) => {
    if (node.type.name === 'event') list.push(`event:${String(node.attrs.ref ?? '')}`)
    else if (node.type.name === 'taskList') {
      const texts: string[] = []
      node.forEach((item) => texts.push(item.textContent))
      list.push(`todos:${texts.join('|')}`)
    } else list.push(`${node.type.name}:${node.textContent}`)
  })
  return list.at(-1) === 'paragraph:' ? list.slice(0, -1) : list
}

/** Types `text` at the cursor, as the keyboard would (input rules run). */
function type(text: string) {
  const view = editor!.view
  for (const char of text) {
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    )
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to))
  }
}

/** Puts the cursor at the end of the text `text` (or at the start of the `index`-th empty line). */
function cursorIn(index: number) {
  let found = -1
  let count = 0
  editor!.state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.type.name === 'paragraph') {
      if (count === index) found = pos + 1 + node.content.size
      count++
    }
    return true
  })
  editor!.commands.setTextSelection(found)
}

describe('events typed in a daily note', () => {
  it('makes an empty line an event being typed, with a time and a space', () => {
    createEditor('Morning')
    editor!.commands.focus('end')
    editor!.commands.enter()
    type('14h ')
    expect(blocks()).toEqual(['paragraph:Morning', 'event:'])
    expect(typingEvent(editor!.state.doc)).toBe(true)
    // Not a time that could be a number of things, nor outside a daily note.
    createEditor('')
    editor!.commands.focus('end')
    type('3 apples')
    expect(blocks()).toEqual(['paragraph:3 apples'])
    createEditor('', null)
    editor!.commands.focus('end')
    type('14h ')
    expect(blocks()).toEqual(['paragraph:14h '])
  })

  it('makes an empty to-do the event, splitting its list around it', () => {
    createEditor('- [ ] Hello\n- [ ] \n- [ ] Third')
    cursorIn(1)
    type('14h ')
    expect(blocks()).toEqual(['todos:Hello', 'event:', 'todos:Third'])
    // First or last to-do: before or after the list; the only one: the list goes.
    createEditor('- [ ] \n- [ ] Second')
    cursorIn(0)
    type('9:30 ')
    expect(blocks()).toEqual(['event:', 'todos:Second'])
    createEditor('- [ ] First\n- [ ] ')
    cursorIn(1)
    type('9h ')
    expect(blocks()).toEqual(['todos:First', 'event:'])
    createEditor('- [ ] ')
    cursorIn(0)
    type('9h ')
    expect(blocks()).toEqual(['event:'])
  })

  it('leaves a nested to-do as it is', () => {
    createEditor('- [ ] Parent\n  - [ ] ')
    cursorIn(1)
    const tr = editor!.state.tr
    expect(
      replaceTodo(tr, editor!.state.selection.$from, editor!.schema.nodes.event!.create()),
    ).toBe(false)
    type('9h ')
    // The nested to-do keeps its text.
    expect(blocks()).toEqual(['todos:Parent9h '])
  })

  it('names the events a note places', () => {
    createEditor('```event\nid: A1\n```\n\nText\n\n```event\nid: F1/uid\n```')
    expect([...placedEvents(editor!.state.doc)]).toEqual(['A1', 'F1/uid'])
    expect(typingEvent(editor!.state.doc)).toBe(false)
  })
})
