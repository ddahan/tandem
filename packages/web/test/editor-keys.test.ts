// @vitest-environment happy-dom
// VS Code-style editing commands: block moves, duplicates, deletes, inserts, and ⌘D occurrences.
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions, starterKitOptions } from '../app/editor/extensions'
import {
  extraSelections,
  findOccurrences,
  mergeRanges,
  motionOf,
  moveInText,
} from '../app/editor/occurrences'
import { isMac } from '../app/utils/platform-keys'
import { normalizeMarkdown } from '../app/utils/markdown-paths'

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

/** The note's Markdown as saved (normalizeMarkdown: an empty line the editor keeps at the end goes). */
const markdown = (e: Editor) => normalizeMarkdown(e.getMarkdown()).trim()

/** Types like a user: through the editor's text input handlers. */
function type(e: Editor, text: string) {
  const { from, to } = e.state.selection
  const insert = () => e.state.tr.insertText(text, from, to)
  const handled = e.view.someProp('handleTextInput', (f) => f(e.view, from, to, text, insert))
  if (!handled) e.view.dispatch(insert())
}

function press(e: Editor, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, ...modifiers })
  e.view.someProp('handleKeyDown', (f) => f(e.view, event))
}

/** The cursor at the end of the paragraph holding `text`. */
function endOf(e: Editor, text: string) {
  cursorAt(e, text)
  e.commands.setTextSelection(e.state.selection.$from.end())
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

  it('removes an empty first line on Backspace, the cursor on the next block', () => {
    const e = setup('Some line')
    e.commands.setTextSelection(1)
    e.commands.insertBlock('above')
    expect(e.state.doc.childCount).toBe(2)
    press(e, 'Backspace')
    expect(markdown(e)).toBe('Some line')
    expect(e.state.selection.from).toBe(1)
    // The only line stays.
    press(e, 'Backspace')
    e.commands.deleteBlock()
    press(e, 'Backspace')
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

/** The text of each selection, main first, then the extra ones. */
const selected = (e: Editor) =>
  [{ from: e.state.selection.from, to: e.state.selection.to }, ...extraSelections(e.state)].map(
    (r) => e.state.doc.textBetween(r.from, r.to),
  )
const keydown = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, ...init })

describe('several cursors and the arrows', () => {
  const word = isMac() ? { altKey: true } : { ctrlKey: true }

  it('moves every cursor: a selection collapses to its end, then character by character', () => {
    const e = setup('cat one\n\ncat two')
    cursorAt(e, 'cat')
    e.commands.selectAllOccurrences()
    press(e, 'ArrowRight')
    expect(extraSelections(e.state)).toHaveLength(1)
    type(e, 's')
    expect(markdown(e)).toBe('cats one\n\ncats two')
    press(e, 'ArrowLeft')
    press(e, 'ArrowLeft')
    type(e, '-')
    expect(markdown(e)).toBe('ca-ts one\n\nca-ts two')
  })

  it('selects with ⇧, from where each cursor is', () => {
    const e = setup('cat one\n\ncat two')
    cursorAt(e, 'cat')
    e.commands.selectAllOccurrences()
    press(e, 'ArrowRight')
    press(e, 'ArrowRight', { shiftKey: true })
    press(e, 'ArrowRight', { shiftKey: true })
    press(e, 'ArrowRight', { shiftKey: true })
    press(e, 'ArrowRight', { shiftKey: true })
    expect(selected(e)).toEqual([' one', ' two'])
    press(e, 'ArrowLeft', { shiftKey: true })
    expect(selected(e)).toEqual([' on', ' tw'])
    type(e, '!')
    expect(markdown(e)).toBe('cat!e\n\ncat!o')
  })

  it('goes by word, as with one cursor', () => {
    const e = setup('cat one more\n\ncat two more')
    cursorAt(e, 'cat')
    e.commands.selectAllOccurrences()
    press(e, 'ArrowRight')
    press(e, 'ArrowRight', word)
    type(e, '!')
    expect(markdown(e)).toBe('cat one! more\n\ncat two! more')
    press(e, 'ArrowLeft', { ...word, shiftKey: true })
    expect(selected(e)).toEqual(['one!', 'two!'])
  })

  it('goes on to the next line from a line’s end, and cursors that meet become one', () => {
    const e = setup('ab\n\ncd')
    // `ab` is 1…3, `cd` 5…7.
    expect(moveInText(e.state.doc, 3, 1, 'char')).toBe(5)
    expect(moveInText(e.state.doc, 5, -1, 'char')).toBe(3)
    expect(
      mergeRanges([
        { from: 3, to: 3 },
        { from: 3, to: 3 },
        { from: 5, to: 5 },
      ]),
    ).toEqual([
      { from: 3, to: 3 },
      { from: 5, to: 5 },
    ])
    expect(
      mergeRanges([
        { from: 1, to: 4 },
        { from: 3, to: 6 },
      ]),
    ).toEqual([{ from: 1, to: 6 }])
  })

  it('steps over an emoji whole', () => {
    const e = setup('a😀b')
    expect(moveInText(e.state.doc, 2, 1, 'char')).toBe(4)
    expect(moveInText(e.state.doc, 4, -1, 'char')).toBe(2)
  })

  it('reads the keys as VS Code does, on a Mac and elsewhere', () => {
    expect(motionOf(keydown('ArrowLeft'), true)).toEqual({ unit: 'char', dir: -1, extend: false })
    expect(motionOf(keydown('ArrowRight', { altKey: true, shiftKey: true }), true)).toEqual({
      unit: 'word',
      dir: 1,
      extend: true,
    })
    expect(motionOf(keydown('ArrowRight', { ctrlKey: true }), false)?.unit).toBe('word')
    expect(motionOf(keydown('ArrowRight', { metaKey: true }), true)?.unit).toBe('lineEdge')
    expect(motionOf(keydown('End'), false)).toEqual({ unit: 'lineEdge', dir: 1, extend: false })
    expect(motionOf(keydown('ArrowDown'), true)).toEqual({ unit: 'line', dir: 1, extend: false })
    // ⌥↑ moves the block, ⌘↑ goes to the note's start: not for every cursor.
    expect(motionOf(keydown('ArrowUp', { altKey: true }), true)).toBeNull()
    expect(motionOf(keydown('ArrowUp', { metaKey: true }), true)).toBeNull()
    expect(motionOf(keydown('a'), true)).toBeNull()
  })

  it('goes back to one cursor with Escape, after moving', () => {
    const e = setup('cat one\n\ncat two')
    cursorAt(e, 'cat')
    e.commands.selectAllOccurrences()
    press(e, 'ArrowRight')
    press(e, 'Escape')
    expect(extraSelections(e.state)).toHaveLength(0)
    type(e, 's')
    expect(markdown(e)).toBe('cats one\n\ncat two')
  })
})

describe('inline code and links end where they end', () => {
  it('Enter after inline code starts a plain line, in a paragraph and in a to-do', () => {
    const e = setup('Some `code`')
    endOf(e, 'Some')
    press(e, 'Enter')
    type(e, 'plain')
    expect(markdown(e)).toBe('Some `code`\n\nplain')

    const todo = setup('- [ ] Some `code`')
    endOf(todo, 'Some')
    press(todo, 'Enter')
    type(todo, 'plain')
    expect(markdown(todo)).toBe('- [ ] Some `code`\n- [ ] plain')
  })

  it('→ at the end of a line ending with code or a link adds nothing (it moves on)', () => {
    for (const note of ['Some `code`\n\nNext', 'See https://example.com\n\nNext']) {
      const e = setup(note)
      endOf(e, 'S')
      const before = e.state.doc
      press(e, 'ArrowRight')
      expect(e.state.doc).toBe(before)
    }
  })

  it('a backtick at the end of inline code leaves it; inside it, it is typed', () => {
    const e = setup('Some `code`')
    endOf(e, 'Some')
    type(e, 'd')
    type(e, '`')
    type(e, ' then')
    expect(markdown(e)).toBe('Some `coded` then')

    const inside = setup('Some `code` here')
    cursorAt(inside, 'code', 2)
    type(inside, '`')
    expect(inside.state.doc.textContent).toBe('Some co`de here')
  })
})

describe('find and replace (⌘F)', () => {
  it('finds matches from the cursor, case-insensitively by default, and wraps around', async () => {
    const { findState } = await import('../app/editor/find')
    const e = setup('Apple pie\n\napple tart\n\nAPPLE juice')
    cursorAt(e, 'tart')
    e.commands.setFind('apple')
    let state = findState(e.state)
    expect(state.matches).toHaveLength(3)
    expect(state.current).toBe(2)
    e.commands.findNext()
    expect(findState(e.state).current).toBe(0)
    expect(e.state.doc.textBetween(e.state.selection.from, e.state.selection.to)).toBe('Apple')
    e.commands.findPrevious()
    expect(findState(e.state).current).toBe(2)

    e.commands.setFind('apple', { caseSensitive: true })
    state = findState(e.state)
    expect(state.matches).toHaveLength(1)
    expect(e.view.dom.querySelectorAll('.find-match--current')).toHaveLength(1)
  })

  it('highlights the matching letters of a file chip, without cutting the chip', async () => {
    const { findState } = await import('../app/editor/find')
    const e = setup(
      'See [cafeline_coffee_nerds_a4.pdf](Note.assets/cafeline_coffee_nerds_a4.pdf) and coffee.',
    )
    e.commands.setTextSelection(1)
    e.commands.setFind('c')
    // Matches inside the chip and outside it.
    expect(findState(e.state).matches).toHaveLength(3)
    const chips = e.view.dom.querySelectorAll('.file-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0]!.textContent).toBe('cafeline_coffee_nerds_a4.pdf')
    // The two c's of the file name, inside the one chip.
    expect([...chips[0]!.querySelectorAll('.find-match')].map((m) => m.textContent)).toEqual([
      'c',
      'c',
    ])
  })

  it('replaces the current match, then all, and follows edits', async () => {
    const { findState } = await import('../app/editor/find')
    const e = setup('cat, cat and cat')
    e.commands.setTextSelection(1)
    e.commands.setFind('cat')
    e.commands.replaceMatch('dog')
    expect(markdown(e)).toBe('dog, cat and cat')
    expect(findState(e.state).matches).toHaveLength(2)
    e.commands.replaceAllMatches('cow')
    expect(markdown(e)).toBe('dog, cow and cow')
    expect(findState(e.state).matches).toHaveLength(0)
    e.commands.setFind('o')
    expect(findState(e.state).matches).toHaveLength(3)
    e.commands.clearFind()
    expect(findState(e.state).matches).toHaveLength(0)
    expect(e.view.dom.querySelectorAll('.find-match')).toHaveLength(0)
  })
})
