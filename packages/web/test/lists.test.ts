// @vitest-environment happy-dom
// Lists, as one set of rules whatever their kinds (see editor/list-keys.ts): each level has one
// kind, any kind at any level; keys move an item one level at a time; saved Markdown reads back
// the same. Notes are built by typing, character by character, as in the editor.
import { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions, starterKitOptions } from '../app/editor/extensions'
import { normalizeMarkdown } from '../app/utils/markdown-paths'

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((e) => e.destroy()))

function parse(markdown: string): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure(starterKitOptions),
      Markdown.configure({ markedOptions: { gfm: true } }),
      ...createExtensions(),
    ],
    content: markdown,
    contentType: 'markdown',
  })
  editors.push(editor)
  return editor
}

/** A note from Markdown, the cursor at its `^`. */
function setup(markdown: string): Editor {
  const e = parse(markdown.replace('^', 'CURSOR'))
  let pos = -1
  e.state.doc.descendants((node, at) => {
    if (node.isText && node.text!.includes('CURSOR')) pos = at + node.text!.indexOf('CURSOR')
  })
  const tr = e.state.tr.delete(pos, pos + 'CURSOR'.length)
  e.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos)))
  return e
}

function press(e: Editor, key: string) {
  // The browser moves the cursor itself on Home: here, to the start of the line.
  if (key === 'Home') {
    const { $from } = e.state.selection
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, $from.start())))
    return
  }
  const event = new KeyboardEvent('keydown', {
    key: key.replace('Shift+', ''),
    shiftKey: key.startsWith('Shift+'),
  })
  e.view.someProp('handleKeyDown', (handle) => handle(e.view, event))
}

/** Types `steps`: text character by character (input rules run), `{Key}` presses a key. */
function typeIn(e: Editor, steps: string): Editor {
  for (const part of steps.split(/(\{[^}]+\})/).filter(Boolean)) {
    if (part.startsWith('{')) {
      press(e, part.slice(1, -1))
      continue
    }
    for (const char of part) {
      const { from, to } = e.state.selection
      const insert = () => e.state.tr.insertText(char, from, to)
      if (!e.view.someProp('handleTextInput', (f) => f(e.view, from, to, char, insert))) {
        e.view.dispatch(insert())
      }
    }
  }
  return e
}

const typed = (steps: string) => typeIn(setup('^'), steps)

const MARKS: Record<string, string> = { bulletList: '•', orderedList: '1.', taskList: '☐' }

/**
 * The note as lines `<indent><marker> <text>` (☑ for a checked to-do, ^ at the cursor, ∅ for an
 * empty line), joined with ` | `. The editor's trailing empty paragraph is left out.
 */
function tree(e: Editor, cursor = true): string {
  const doc = cursor ? e.state.tr.insertText('^', e.state.selection.from).doc : e.state.doc
  const lines: string[] = []
  const line = (depth: number, prefix: string, block: ProseMirrorNode) =>
    lines.push(
      '  '.repeat(depth) +
        prefix +
        (block.isTextblock ? block.textContent || '∅' : `<${block.type.name}>`),
    )
  const list = (node: ProseMirrorNode, depth: number) =>
    node.forEach((item) => {
      const marker =
        node.type.name === 'taskList' ? (item.attrs.checked ? '☑' : '☐') : MARKS[node.type.name]!
      item.forEach((block, _offset, index) => {
        if (block.type.name in MARKS) list(block, depth + 1)
        else line(depth, index === 0 ? `${marker} ` : '   ', block)
      })
    })
  doc.forEach((block) => (block.type.name in MARKS ? list(block, 0) : line(0, '', block)))
  if (lines.at(-1) === '∅') lines.pop()
  return lines.join(' | ')
}

const saved = (e: Editor) => normalizeMarkdown(e.getMarkdown())

const KINDS = { bullet: '- ', numbered: '1. ', 'to-do': '[ ] ' } as const
type Kind = keyof typeof KINDS
const MARK: Record<Kind, string> = { bullet: '•', numbered: '1.', 'to-do': '☐' }
const PAIRS = (Object.keys(KINDS) as Kind[]).flatMap((parent) =>
  (Object.keys(KINDS) as Kind[]).map((child) => [parent, child] as const),
)

/** A `parent` item with a `child` sub-item, the cursor on a new empty sub-item. */
function nested(parent: Kind, child: Kind) {
  // The level's own marker isn't typed again (it would be absorbed anyway).
  const childMarker = parent === child ? '' : KINDS[child]
  return typed(`${KINDS[parent]}Parent{Enter}{Tab}${childMarker}Child{Enter}`)
}

describe('one level out: Enter in an empty item, Shift+Tab, Backspace at its start', () => {
  it.each(PAIRS)('%s > %s', (parent, child) => {
    const start = `${MARK[parent]} Parent |   ${MARK[child]} Child`
    expect(tree(nested(parent, child))).toBe(`${start} |   ${MARK[child]} ^`)
    // The item becomes one of the level above, of its kind; the same for the three keys.
    for (const key of ['{Enter}', '{Shift+Tab}', '{Backspace}']) {
      expect({ key, tree: tree(typeIn(nested(parent, child), key)) }).toEqual({
        key,
        tree: `${start} | ${MARK[parent]} ^`,
      })
    }
    // With text: Shift+Tab keeps it.
    expect(tree(typeIn(nested(parent, child), 'Second{Shift+Tab}'))).toBe(
      `${start} | ${MARK[parent]} Second^`,
    )
    // From the top level: a paragraph; then Backspace joins the line above.
    const e = typeIn(nested(parent, child), '{Enter}{Enter}')
    expect(tree(e)).toBe(`${start} | ^`)
    expect(tree(typeIn(e, '{Backspace}'))).toBe(`${MARK[parent]} Parent |   ${MARK[child]} Child^`)
  })

  it('takes the items after it as its sub-items', () => {
    const e = setup('- P\n  - [ ] a\n  - [ ] ^b\n  - [ ] c')
    press(e, 'Shift+Tab')
    expect(tree(e)).toBe('• P |   ☐ a | • ^b |   ☐ c')
  })

  it('keeps the numbers of the level it joins', () => {
    const e = setup('1. a\n   1. b\n   2. ^c\n2. d')
    press(e, 'Shift+Tab')
    expect(saved(e)).toBe('1. a\n   1. b\n2. c\n3. d\n')
  })
})

describe('Backspace', () => {
  it('walks an empty item out one level at a time, then joins the line above: never loops', () => {
    // A numbered list in a to-do in a numbered list, as typed.
    const e = typed('1. dq{Enter}{Tab}[ ] Hello{Enter}{Tab}1. TADA{Enter}')
    const steps = [tree(e)]
    for (let i = 0; i < 4; i++) steps.push(tree(typeIn(e, '{Backspace}')))
    expect(steps).toEqual([
      '1. dq |   ☐ Hello |     1. TADA |     1. ^',
      '1. dq |   ☐ Hello |     1. TADA |   ☐ ^',
      '1. dq |   ☐ Hello |     1. TADA | 1. ^',
      '1. dq |   ☐ Hello |     1. TADA | ^',
      '1. dq |   ☐ Hello |     1. TADA^',
    ])
  })

  it('at the start of a top item: a paragraph (the list splits), then joins the item above', () => {
    const e = setup('- a\n- ^b\n- c')
    press(e, 'Backspace')
    expect(tree(e)).toBe('• a | ^b | • c')
    press(e, 'Backspace')
    expect(tree(e)).toBe('• a^b | • c')
  })

  it('keeps the sub-items of a first item made a paragraph', () => {
    const e = setup('- ^a\n  - b')
    press(e, 'Backspace')
    expect(tree(e)).toBe('^a | • b')
  })

  it('joins a paragraph to the end of the list above it', () => {
    const e = setup('- [ ] a\n  - b\n\n^c')
    press(e, 'Backspace')
    expect(tree(e)).toBe('☐ a |   • b^c')
  })

  it('right after a list is made by typing its marker: a plain line again', () => {
    const e = typed('- ')
    expect(tree(e)).toBe('• ^')
    press(e, 'Backspace')
    expect(tree(e)).toBe('^')
  })
})

describe('Tab: one level in', () => {
  it('goes under the item above, in a new sub-list of its kind', () => {
    expect(tree(typed('- a{Enter}b{Tab}'))).toBe('• a |   • b^')
  })

  it('moves the line alone: its sub-items stay, right after it in its new level', () => {
    const e = setup('- a\n- ^b\n  - c\n    - d\n  - e')
    press(e, 'Tab')
    expect(tree(e)).toBe('• a |   • ^b |   • c |     • d |   • e')
    // Into sub-items of another kind: the line's sub-items take that kind too.
    const mixed = setup('- a\n  - [ ] x\n- ^b\n  - c')
    press(mixed, 'Tab')
    expect(tree(mixed)).toBe('• a |   ☐ x |   ☐ ^b |   ☐ c')
    // Shift+Tab takes the items after it (see above): both ways are a key away.
    press(e, 'Shift+Tab')
    expect(tree(e)).toBe('• a | • ^b |   • c |     • d |   • e')
  })

  it('joins the sub-items of the item above, taking their kind', () => {
    const e = typed('[ ] Parent{Enter}{Tab}- Child{Enter}{Shift+Tab}Next{Tab}')
    expect(tree(e)).toBe('☐ Parent |   • Child |   • Next^')
  })

  it('leaves a first item where it is (and keeps the key: the focus stays)', () => {
    const e = typed('- a')
    const event = new KeyboardEvent('keydown', { key: 'Tab' })
    expect(e.view.someProp('handleKeyDown', (handle) => handle(e.view, event))).toBe(true)
    expect(tree(e)).toBe('• a^')
  })
})

describe('Enter', () => {
  it('splits an item at the cursor, in its level and kind', () => {
    const e = setup('- [x] a^b')
    press(e, 'Enter')
    // A new to-do is unchecked.
    expect(tree(e)).toBe('☑ a | ☐ ^b')
  })

  it('at the start of an item, adds an empty one above', () => {
    const e = setup('1. ^ab')
    press(e, 'Enter')
    expect(tree(e)).toBe('1. ∅ | 1. ^ab')
  })

  it('in empty items, steps out level by level, then leaves the list', () => {
    const e = typed('- a{Enter}{Tab}[ ] b{Enter}{Tab}1. c{Enter}')
    const steps = [tree(e)]
    for (let i = 0; i < 3; i++) steps.push(tree(typeIn(e, '{Enter}')))
    expect(steps).toEqual([
      '• a |   ☐ b |     1. c |     1. ^',
      '• a |   ☐ b |     1. c |   ☐ ^',
      '• a |   ☐ b |     1. c | • ^',
      '• a |   ☐ b |     1. c | ^',
    ])
  })
})

describe('Delete at the end of a line', () => {
  it.each(PAIRS)('%s > %s: brings the sub-item up a level, then joins it', (parent, child) => {
    const childLine = `${child === 'to-do' ? '- [ ]' : child === 'numbered' ? '1.' : '-'} b`
    const parentLine = `${parent === 'to-do' ? '- [ ]' : parent === 'numbered' ? '1.' : '-'} a^`
    const indent = parent === 'numbered' ? '   ' : '  '
    const e = setup(`${parentLine}\n${indent}${childLine}`)
    press(e, 'Delete')
    expect(tree(e)).toBe(`${MARK[parent]} a^ | ${MARK[parent]} b`)
    press(e, 'Delete')
    expect(tree(e)).toBe(`${MARK[parent]} a^b`)
  })
})

describe('list markers typed at the start of an item', () => {
  it.each(PAIRS.filter(([parent, child]) => parent !== child))(
    'in a %s level, %s changes the level',
    (level, marker) => {
      const e = typed(`${KINDS[level]}a{Enter}b{Enter}{Home}`)
      typeIn(e, KINDS[marker])
      expect(tree(e)).toBe(`${MARK[marker]} a | ${MARK[marker]} b | ${MARK[marker]} ^`)
    },
  )

  it('absorbs the level’s own marker; in a to-do, [x] and [ ] set the box', () => {
    expect(tree(typed('- a{Enter}- b'))).toBe('• a | • b^')
    expect(tree(typed('1. a{Enter}1. b'))).toBe('1. a | 1. b^')
    const todo = typed('[ ] a{Enter}[x] b')
    expect(tree(todo)).toBe('☐ a | ☑ b^')
    expect(tree(typeIn(todo, '{Home}[ ] '))).toBe('☐ a | ☐ ^b')
  })

  it('leaves them as text in the middle of an item', () => {
    expect(tree(typed('- a [ ] b'))).toBe('• a [ ] b^')
    expect(tree(typed('[ ] a - b'))).toBe('☐ a - b^')
  })

  it('accepts [] for a to-do', () => {
    expect(tree(typed('- a{Enter}{Tab}[] b'))).toBe('• a |   ☐ b^')
  })
})

describe('saved Markdown reads back the same', () => {
  const kinds = Object.keys(KINDS) as Kind[]
  const triples = kinds.flatMap((a) => kinds.flatMap((b) => kinds.map((c) => [a, b, c] as const)))

  it.each(triples)('%s > %s > %s, with items before and after', (a, b, c) => {
    const marker = (kind: Kind, previous: Kind | null) => (kind === previous ? '' : KINDS[kind])
    const e = typed(
      `${KINDS[a]}one{Enter}{Tab}${marker(b, a)}two{Enter}{Tab}${marker(c, b)}three{Enter}` +
        `four{Enter}{Enter}five{Enter}{Enter}six`,
    )
    expect(tree(e, false)).toBe(
      `${MARK[a]} one |   ${MARK[b]} two |     ${MARK[c]} three |     ${MARK[c]} four | ` +
        `  ${MARK[b]} five | ${MARK[a]} six`,
    )
    expect(tree(parse(saved(e)), false)).toBe(tree(e, false))
  })

  it('leaves out empty items (Markdown can’t keep them)', () => {
    // An empty sub-item right under its parent's text would read back as a heading.
    const e = typed('- a{Enter}{Tab}')
    expect(saved(e)).toBe('- a\n')
    const numbered = setup('1. a\n2. b^')
    typeIn(numbered, '{Enter}')
    expect(saved(numbered)).toBe('1. a\n2. b\n')
  })
})
