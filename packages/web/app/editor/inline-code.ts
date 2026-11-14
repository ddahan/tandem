// Inline code ends where it ends. The mark itself is Nuxt UI's editor's (TipTap's, combinable
// with other marks), whose options can't be set from here, so this extension adjusts it:
// - Enter doesn't carry it to the new line: it is taken out of the marks a split keeps
//   (TipTap's `keepOnSplit`).
// - → at the end of a line goes on to the next one. TipTap's exit (the mark is "exitable")
//   typed a space there instead: the first press seemed stuck, and it changed the note. At the
//   note's very end, → leaves it without typing anything.
// - A backtick typed at its end leaves it, as Markdown's closing backtick would: what's typed
//   next is plain text (⌘E, which toggles it, does too).
import { Extension } from '@tiptap/core'
import type { MarkType } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection, type EditorState, type Transaction } from '@tiptap/pm/state'

/** At the end of inline code (what follows isn't code): no more code for what's typed next. */
export function leaveCodeAt(state: EditorState, pos: number, type: MarkType): Transaction | null {
  const $pos = state.doc.resolve(pos)
  const marks = state.storedMarks ?? $pos.marks()
  if (!type.isInSet(marks)) return null
  const after = $pos.nodeAfter
  if (after && type.isInSet(after.marks)) return null
  return state.tr.setStoredMarks(type.removeFromSet(marks))
}

/**
 * → with the cursor at the end of a line ending with inline code: on to what follows, as
 * without it (the next line's start, or the block after it selected); at the note's end, out
 * of the code. Null elsewhere (the arrow moves as usual).
 */
export function arrowPastCode(state: EditorState, type: MarkType): Transaction | null {
  const { selection } = state
  const { $from } = selection
  if (!selection.empty || !$from.parent.isTextblock || $from.pos !== $from.end()) return null
  if (!type.isInSet(state.storedMarks ?? $from.marks())) return null
  const next = Selection.findFrom(state.doc.resolve($from.after()), 1)
  if (next) return state.tr.setSelection(next).scrollIntoView()
  return leaveCodeAt(state, $from.pos, type)
}

export const InlineCodeEnds = Extension.create({
  name: 'inlineCodeEnds',
  // Before the mark's own keys (its exit on →).
  priority: 1000,

  onBeforeCreate() {
    const manager = this.editor.extensionManager
    manager.splittableMarks = manager.splittableMarks.filter((name) => name !== 'code')
  },

  addKeyboardShortcuts() {
    return {
      ArrowRight: ({ editor }) => {
        const type = editor.schema.marks.code
        const tr = type && arrowPastCode(editor.state, type)
        if (!tr) return false
        editor.view.dispatch(tr)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('leaveInlineCode'),
        props: {
          handleTextInput(view, from, to, text) {
            const type = view.state.schema.marks.code
            if (text !== '`' || from !== to || !type) return false
            const tr = leaveCodeAt(view.state, from, type)
            if (!tr) return false
            view.dispatch(tr)
            return true
          },
        },
      }),
    ]
  },
})
