// @vitest-environment happy-dom
// VS Code-style editing commands: block moves, duplicates, deletes, inserts, and ⌘D occurrences.
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions, starterKitOptions } from '../app/editor/extensions'
import { extraSelections, findOccurrences } from '../app/editor/occurrences'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function setup(markdown: string) {
  editor = new Editor({
    extensions: [StarterKit.configure(starterKitOptions), Markdown, ...createExtensions()],
    content: markdown,
    contentType: 'markdown',
  })
  return editor
}

/** Puts the cursor inside the first occurrence of `text` (at its start + `offset`). */
function cursorAt(e: Editor, text: string, offset = 0) {
  const [range] = findOccurrences(e.state.doc, text)
  if (!range) throw new Error(`"${text}" not found`)
  e.commands.setTextSelection(range.from + offset)
}

const markdown = (e: Editor) => e.getMarkdown().trim()

/** Types like a user: through the editor's text input handlers. */
function type(e: Editor, text: string) {
  const { from, to } = e.state.selection
  const insert = () => e.state.tr.insertText(text, from, to)
  const handled = e.view.someProp('handleTextInput', (f) => f(e.view, from, to, text, insert))
  if (!handled) e.view.dispatch(insert())
}

function press(e: Editor, key: string) {
  const event = new KeyboardEvent('keydown', { key })
  e.view.someProp('handleKeyDown', (f) => f(e.view, event))
}

describe('block moves (⌥↑ / ⌥↓)', () => {
  it('moves the current paragraph, keeping the cursor in it', () => {
    const e = setup('One\n\nTwo\n\nThree')
    cursorAt(e, 'Two', 1)
    expect(e.commands.moveBlock('up')).toBe(true)
    expect(markdown(e)).toBe('Two\n\nOne\n\nThree')
    expect(e.state.selection.$from.parent.textContent).toBe('Two')
    e.commands.moveBlock('down')
    e.commands.moveBlock('down')
    expect(markdown(e)).toBe('One\n\nThree\n\nTwo')
    expect(e.commands.moveBlock('down')).toBe(false)
  })

  it('moves list items within their list', () => {
    const e = setup('- [ ] a\n- [ ] b\n- [ ] c')
    cursorAt(e, 'c')
    e.commands.moveBlock('up')
    expect(markdown(e)).toBe('- [ ] a\n- [ ] c\n- [ ] b')
  })

  it('moves several selected blocks together', () => {
    const e = setup('A\n\nB\n\nC\n\nD')
    const [b] = findOccurrences(e.state.doc, 'B')
    const [c] = findOccurrences(e.state.doc, 'C')
    e.commands.setTextSelection({ from: b!.from, to: c!.to })
    e.commands.moveBlock('up')
    expect(markdown(e)).toBe('B\n\nC\n\nA\n\nD')
  })
})

describe('duplicate, delete, insert', () => {
  it('duplicates the block below (cursor on the copy) or above', () => {
    const e = setup('One\n\nTwo')
    cursorAt(e, 'One', 2)
    e.commands.duplicateBlock('down')
    expect(markdown(e)).toBe('One\n\nOne\n\nTwo')
    expect(e.state.selection.from).toBeGreaterThan(findOccurrences(e.state.doc, 'One')[1]!.from)
    e.commands.duplicateBlock('up')
    expect(markdown(e)).toBe('One\n\nOne\n\nOne\n\nTwo')
  })

  it('deletes the current block, and a list with its last item', () => {
    const e = setup('One\n\n- a\n\nThree')
    cursorAt(e, 'One')
    e.commands.deleteBlock()
    expect(markdown(e)).toBe('- a\n\nThree')
    cursorAt(e, 'a')
    e.commands.deleteBlock()
    expect(markdown(e)).toBe('Three')
    e.commands.deleteBlock()
    expect(e.state.doc.childCount).toBe(1)
  })

  it('inserts an empty paragraph, or a list item in lists, below or above', () => {
    const e = setup('One\n\n- [ ] task')
    cursorAt(e, 'One')
    e.commands.insertBlock('below')
    type(e, 'Inserted')
    cursorAt(e, 'task')
    e.commands.insertBlock('above')
    type(e, 'new task')
    expect(markdown(e)).toBe('One\n\nInserted\n\n- [ ] new task\n- [ ] task')
  })
})

describe('occurrences (⌘D, ⌘⇧L)', () => {
  it('selects the word, then each next occurrence, wrapping around', () => {
    const e = setup('cat dog cat\n\ncat end')
    cursorAt(e, 'dog', 1)
    e.commands.selectNextOccurrence()
    expect(e.state.doc.textBetween(e.state.selection.from, e.state.selection.to)).toBe('dog')

    cursorAt(e, 'cat', 1)
    e.commands.selectNextOccurrence()
    e.commands.selectNextOccurrence()
    e.commands.selectNextOccurrence()
    expect(extraSelections(e.state)).toHaveLength(2)
  })

  it('types, deletes and erases in every occurrence', () => {
    const e = setup('cat dog cat\n\ncat end')
    cursorAt(e, 'cat')
    e.commands.selectNextOccurrence()
    e.commands.selectAllOccurrences()
    expect(extraSelections(e.state)).toHaveLength(2)
    type(e, 'c')
    type(e, 'o')
    type(e, 'w')
    expect(markdown(e)).toBe('cow dog cow\n\ncow end')
    press(e, 'Backspace')
    expect(markdown(e)).toBe('co dog co\n\nco end')
  })

  it('goes back to one selection with Escape or a cursor move', () => {
    const e = setup('a b a')
    cursorAt(e, 'a')
    e.commands.selectAllOccurrences()
    expect(extraSelections(e.state)).toHaveLength(1)
    press(e, 'Escape')
    expect(extraSelections(e.state)).toHaveLength(0)
    e.commands.selectAllOccurrences()
    e.commands.setTextSelection(1)
    expect(extraSelections(e.state)).toHaveLength(0)
    type(e, 'x')
    expect(markdown(e)).toBe('xa b a')
  })
})
