// VS Code's ⌘D: the first press selects the word at the cursor, each next press adds the next
// occurrence of the selection; ⌘⇧L adds all of them. Typing, Backspace and Delete then apply to
// every occurrence. Esc, a click or moving the cursor goes back to a single selection.
//
// ProseMirror has one selection: the extra ones are kept here (mapped through every change) and
// drawn as decorations. Keys are listed on the Shortcuts page (utils/shortcuts.ts).
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    occurrences: {
      selectNextOccurrence: () => ReturnType
      selectAllOccurrences: () => ReturnType
    }
  }
}

export interface Range {
  from: number
  to: number
}

export const occurrencesKey = new PluginKey<Range[]>('occurrences')

/** The extra selections (besides the editor's own selection). */
export function extraSelections(state: EditorState): Range[] {
  return occurrencesKey.getState(state) ?? []
}

/**
 * Every occurrence of `text` in the document, in order (within a block, not across blocks).
 * Case-insensitive matching compares lowercase text, when lowercasing keeps the length (it
 * does for the scripts notes use), so that offsets stay positions.
 */
export function findOccurrences(
  doc: ProseMirrorNode,
  text: string,
  options: { caseSensitive?: boolean } = {},
): Range[] {
  const found: Range[] = []
  if (!text) return found
  const caseSensitive = options.caseSensitive ?? true
  const query = caseSensitive ? text : text.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // One character per position: inline leaves (links to notes, line breaks) count as one.
    const raw = node.textBetween(0, node.content.size, undefined, '￼')
    const lower = raw.toLowerCase()
    const content = caseSensitive || lower.length !== raw.length ? raw : lower
    let index = content.indexOf(query)
    while (index !== -1) {
      found.push({ from: pos + 1 + index, to: pos + 1 + index + query.length })
      index = content.indexOf(query, index + query.length)
    }
    return false
  })
  return found
}

const isWord = (char: string | undefined) => !!char && /[\p{L}\p{N}_]/u.test(char)

/** The word around an empty selection, or null. */
function wordAt(state: EditorState): Range | null {
  const { $from } = state.selection
  if (!$from.parent.isTextblock) return null
  const text = $from.parent.textBetween(0, $from.parent.content.size, undefined, '￼')
  const offset = $from.parentOffset
  let start = offset
  let end = offset
  while (isWord(text[start - 1])) start--
  while (isWord(text[end])) end++
  if (start === end) return null
  return { from: $from.start() + start, to: $from.start() + end }
}

function withExtras(tr: Transaction, ranges: Range[]): Transaction {
  return tr.setMeta(occurrencesKey, ranges)
}

/** Applies an edit to the main selection and every extra one, keeping a cursor in each. */
function editAll(view: EditorView, edit: (tr: Transaction, range: Range) => Range | null): boolean {
  const { state } = view
  const extras = extraSelections(state)
  if (!extras.length) return false
  const main = { from: state.selection.from, to: state.selection.to }
  // From the end: earlier positions stay valid while later ones change.
  const ranges = [main, ...extras].toSorted((a, b) => b.from - a.from)
  const tr = state.tr
  const results: { range: Range; isMain: boolean; steps: number }[] = []
  for (const range of ranges) {
    const edited = edit(tr, range)
    if (edited) results.push({ range: edited, isMain: range === main, steps: tr.steps.length })
  }
  // Positions computed before the later (earlier-in-document) edits: map them to the end.
  const mapped = results.map(({ range, isMain, steps }) => {
    const mapping = tr.mapping.slice(steps)
    return { from: mapping.map(range.from, 1), to: mapping.map(range.to, 1), isMain }
  })
  const mainResult = mapped.find((r) => r.isMain) ?? mapped[0]!
  tr.setSelection(TextSelection.create(tr.doc, mainResult.from, mainResult.to))
  view.dispatch(
    withExtras(
      tr,
      mapped.filter((r) => r !== mainResult).map(({ from, to }) => ({ from, to })),
    ).scrollIntoView(),
  )
  return true
}

function scrollTo(view: EditorView, pos: number) {
  requestAnimationFrame(() => {
    // The editor may be gone (note closed) by the next frame.
    if (view.isDestroyed || pos > view.state.doc.content.size) return
    const { node } = view.domAtPos(pos)
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
    element?.scrollIntoView?.({ block: 'nearest' })
  })
}

export const Occurrences = Extension.create({
  name: 'occurrences',

  addCommands() {
    return {
      selectNextOccurrence:
        () =>
        ({ state, tr, dispatch, view }) => {
          const { selection } = state
          if (selection.empty) {
            const word = wordAt(state)
            if (!word) return false
            if (dispatch)
              dispatch(
                withExtras(tr.setSelection(TextSelection.create(tr.doc, word.from, word.to)), []),
              )
            return true
          }
          const text = state.doc.textBetween(selection.from, selection.to, '\n', '￼')
          if (!text || text.includes('\n')) return false
          const taken = [{ from: selection.from, to: selection.to }, ...extraSelections(state)]
          const all = findOccurrences(state.doc, text)
          const last = Math.max(...taken.map((r) => r.to))
          const isFree = (r: Range) => !taken.some((t) => t.from === r.from)
          // The next one after the last added, wrapping around to the start.
          const next = all.find((r) => r.from >= last && isFree(r)) ?? all.find(isFree)
          if (!next) return true
          if (dispatch) {
            dispatch(withExtras(tr, [...extraSelections(state), next]))
            scrollTo(view, next.from)
          }
          return true
        },

      selectAllOccurrences:
        () =>
        ({ state, tr, dispatch }) => {
          let { selection } = state
          let base = tr
          if (selection.empty) {
            const word = wordAt(state)
            if (!word) return false
            base = tr.setSelection(TextSelection.create(tr.doc, word.from, word.to))
            selection = base.selection
          }
          const text = base.doc.textBetween(selection.from, selection.to, '\n', '￼')
          if (!text || text.includes('\n')) return false
          const others = findOccurrences(base.doc, text).filter((r) => r.from !== selection.from)
          if (dispatch) dispatch(withExtras(base, others))
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-d': () => this.editor.commands.selectNextOccurrence(),
      'Mod-Shift-l': () => this.editor.commands.selectAllOccurrences(),
      Escape: () => {
        if (!extraSelections(this.editor.state).length) return false
        this.editor.view.dispatch(withExtras(this.editor.state.tr, []))
        return true
      },
      Backspace: () =>
        editAll(this.editor.view, (tr, range) => {
          if (range.from !== range.to) {
            tr.delete(range.from, range.to)
            return { from: range.from, to: range.from }
          }
          const $pos = tr.doc.resolve(range.from)
          if ($pos.parentOffset === 0) return { from: range.from, to: range.from }
          tr.delete(range.from - 1, range.from)
          return { from: range.from - 1, to: range.from - 1 }
        }),
      Delete: () =>
        editAll(this.editor.view, (tr, range) => {
          if (range.from !== range.to) {
            tr.delete(range.from, range.to)
            return { from: range.from, to: range.from }
          }
          const $pos = tr.doc.resolve(range.from)
          if ($pos.parentOffset === $pos.parent.content.size)
            return { from: range.from, to: range.from }
          tr.delete(range.from, range.from + 1)
          return { from: range.from, to: range.from }
        }),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<Range[]>({
        key: occurrencesKey,
        state: {
          init: () => [],
          apply(tr, ranges) {
            const set = tr.getMeta(occurrencesKey) as Range[] | undefined
            if (set) return set
            if (!ranges.length) return ranges
            // Moving the selection (click, arrows) goes back to a single selection.
            if (tr.selectionSet && !tr.docChanged) return []
            if (!tr.docChanged) return ranges
            return ranges.map((r) => ({
              from: tr.mapping.map(r.from, 1),
              to: tr.mapping.map(r.to, -1),
            }))
          },
        },
        props: {
          decorations(state) {
            const ranges = extraSelections(state)
            if (!ranges.length) return null
            return DecorationSet.create(
              state.doc,
              ranges.map((r) =>
                r.from === r.to
                  ? Decoration.widget(r.from, () => {
                      const caret = document.createElement('span')
                      caret.className = 'occurrence-caret'
                      return caret
                    })
                  : Decoration.inline(r.from, r.to, { class: 'occurrence-selection' }),
              ),
            )
          },
          handleTextInput(view, from, to, text) {
            const extras = extraSelections(view.state)
            if (!extras.length) return false
            // The text replaces the main selection (from…to) and every extra one.
            return editAll(view, (tr, range) => {
              const isMain =
                range.from === view.state.selection.from && range.to === view.state.selection.to
              const start = isMain ? from : range.from
              const end = isMain ? to : range.to
              tr.insertText(text, start, end)
              return { from: start + text.length, to: start + text.length }
            })
          },
          handlePaste(view) {
            // Pasting into several places isn't supported: back to one selection.
            if (extraSelections(view.state).length) view.dispatch(withExtras(view.state.tr, []))
            return false
          },
        },
      }),
    ]
  },
})
