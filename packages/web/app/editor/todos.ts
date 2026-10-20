// TODOs highlighted in the editor: `TODO:` and the rest of its line, by the rule the TODOs page
// lists them with (`todoRanges`, in shared). Code (blocks and inline) holds none. A TODO picked
// on the TODOs page flashes once the note shows it (`revealTodo`).
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { todoRanges } from '@tandem/shared'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    todos: {
      /** Puts the cursor at the end of the TODO (the `index`-th, or the first whose text is
       * `text`), scrolls to it and flashes it. */
      revealTodo: (index: number, text?: string) => ReturnType
    }
  }
}

export interface TodoRange {
  from: number
  to: number
  /** What follows `TODO:`, as it reads. */
  text: string
}

/** The TODOs of a document, in order. */
export function todoPositions(doc: ProseMirrorNode): TodoRange[] {
  const found: TodoRange[] = []
  doc.descendants((block, pos) => {
    if (!block.isTextblock) return true
    if (block.type.spec.code) return false
    // The block's text, one character per position: inline code blanked, other inline nodes
    // (wiki links, images, line breaks) as one placeholder each.
    let text = ''
    block.forEach((child) => {
      if (child.isText) {
        const code = child.marks.some((mark) => mark.type.spec.code)
        text += code ? ' '.repeat(child.text!.length) : child.text!
      } else {
        text += child.type.name === 'hardBreak' ? '\n' : '￼'.repeat(child.nodeSize)
      }
    })
    for (const { start, end } of todoRanges(text)) {
      found.push({
        from: pos + 1 + start,
        to: pos + 1 + end,
        text: text
          .slice(start + 'TODO:'.length, end)
          .replace(/\s+/g, ' ')
          .trim(),
      })
    }
    return false
  })
  return found
}

interface TodosState {
  decorations: DecorationSet
  /** The TODO just gone to, flashing. */
  flash: TodoRange | null
}

const key = new PluginKey<TodosState>('todos')

function decorate(doc: ProseMirrorNode, flash: TodoRange | null): DecorationSet {
  const decorations = todoPositions(doc).flatMap(({ from, to }) => [
    Decoration.inline(from, to, { class: 'todo-highlight' }),
    // The marker itself, as the TODOs page shows it.
    Decoration.inline(from, from + 'TODO:'.length, { class: 'todo-marker' }),
  ])
  if (flash) decorations.push(Decoration.inline(flash.from, flash.to, { class: 'todo-flash' }))
  return DecorationSet.create(doc, decorations)
}

export const Todos = Extension.create({
  name: 'todos',

  addCommands() {
    return {
      revealTodo:
        (index, text) =>
        ({ tr, dispatch, view }) => {
          const todos = todoPositions(tr.doc)
          const todo =
            (todos[index]?.text === text ? todos[index] : null) ??
            todos.find((candidate) => text !== undefined && candidate.text === text) ??
            todos[Math.min(index, todos.length - 1)]
          if (!todo) return false
          if (dispatch) {
            tr.setSelection(TextSelection.create(tr.doc, todo.to)).setMeta(key, { flash: todo })
            // After the update: the flash fades, and the TODO is centered rather than at an edge.
            requestAnimationFrame(() => {
              // The note may be closed already, or edited since (the flash follows edits).
              const flash = view.isDestroyed ? null : key.getState(view.state)?.flash
              if (!flash) return
              const dom = view.domAtPos(flash.from).node
              const element = dom instanceof HTMLElement ? dom : dom.parentElement
              element?.scrollIntoView({ block: 'center' })
              setTimeout(() => {
                if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, { flash: null }))
              }, 1600)
            })
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<TodosState>({
        key,
        state: {
          init: (_, state): TodosState => ({ decorations: decorate(state.doc, null), flash: null }),
          apply(tr, value, _old, state): TodosState {
            const meta = tr.getMeta(key) as { flash: TodoRange | null } | undefined
            if (!tr.docChanged && !meta) return value
            // The flash follows edits until it ends (the editor adjusts the note as it opens).
            const flash = meta
              ? meta.flash
              : value.flash && {
                  ...value.flash,
                  from: tr.mapping.map(value.flash.from),
                  to: tr.mapping.map(value.flash.to, -1),
                }
            const kept = flash && flash.to > flash.from ? flash : null
            return { decorations: decorate(state.doc, kept), flash: kept }
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
        },
      }),
    ]
  },
})
