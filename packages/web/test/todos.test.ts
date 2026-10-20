// @vitest-environment happy-dom
// TODOs in the editor: what is highlighted, and where (the TODOs page jumps there).
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions, starterKitOptions } from '../app/editor/extensions'
import { todoPositions } from '../app/editor/todos'

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

describe('TODOs in the editor', () => {
  it('spans TODO: and the rest of its block, as the TODOs page lists them', () => {
    const e = setup('Intro\n\n**Note** TODO: ask *Bob*\n\n- [ ] task TODO: call\n')
    const todos = todoPositions(e.state.doc)
    expect(todos.map((todo) => e.state.doc.textBetween(todo.from, todo.to))).toEqual([
      'TODO: ask Bob',
      'TODO: call',
    ])
    expect(todos.map((todo) => todo.text)).toEqual(['ask Bob', 'call'])
  })

  it('finds none in code, in lowercase, or glued to a word', () => {
    const e = setup('`TODO: x`\n\n```\nTODO: y\n```\n\ntodo: z myTODO: w')
    expect(todoPositions(e.state.doc)).toEqual([])
  })

  it('goes to a TODO by its text when the list is out of date', () => {
    const e = setup('TODO: first\n\nTODO: second')
    expect(e.commands.revealTodo(0, 'second')).toBe(true)
    expect(e.state.doc.textBetween(e.state.selection.from - 6, e.state.selection.from)).toBe(
      'second',
    )
  })
})
