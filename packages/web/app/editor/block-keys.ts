// VS Code's line shortcuts, for blocks: move (⌥↑/⌥↓), duplicate (⇧⌥↑/⇧⌥↓), delete (⌘⇧K) and
// insert a block below or above (⌘↵ / ⌘⇧↵). "The current block" is the paragraph, heading,
// code block… holding the selection, or the list item when it is in a list; a selection over
// several blocks acts on all of them. Keys are listed on the Shortcuts page (utils/shortcuts.ts).
// Also: Backspace in an empty first line removes it (ProseMirror has nothing to join it to, and
// did nothing).
import { Extension } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode, type NodeRange } from '@tiptap/pm/model'
import {
  NodeSelection,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockKeys: {
      moveBlock: (direction: 'up' | 'down') => ReturnType
      duplicateBlock: (direction: 'up' | 'down') => ReturnType
      deleteBlock: () => ReturnType
      insertBlock: (direction: 'above' | 'below') => ReturnType
    }
  }
}

const LIST_ITEMS = new Set(['listItem', 'taskItem'])
const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])

/** Backspace in an empty first line, with blocks after it: the line goes, the cursor goes to
 * the start of the next block. */
function removeEmptyFirstLine(state: EditorState, dispatch: (tr: Transaction) => void): boolean {
  const { $from, empty } = state.selection
  if (!empty || $from.depth !== 1 || $from.index(0) !== 0 || state.doc.childCount < 2) return false
  if (!$from.parent.isTextblock || $from.parent.content.size > 0) return false
  const tr = state.tr.delete($from.before(), $from.after())
  dispatch(tr.setSelection(Selection.atStart(tr.doc)).scrollIntoView())
  return true
}

/** The blocks the selection covers, at the level they can be moved: list items, or blocks. */
export function selectedBlocks(state: EditorState): NodeRange | null {
  const { $from, $to } = state.selection
  if (state.selection instanceof NodeSelection) {
    const $pos = state.doc.resolve(state.selection.from)
    return $pos.blockRange(state.doc.resolve(state.selection.to)) ?? null
  }
  // Inside a list item, the item moves (not the paragraph inside it).
  return $from.blockRange($to, (parent) => !LIST_ITEMS.has(parent.type.name)) ?? null
}

function rangeBounds(range: NodeRange) {
  return {
    start: range.start,
    end: range.end,
    nodes: Array.from({ length: range.endIndex - range.startIndex }, (_, i) =>
      range.parent.child(range.startIndex + i),
    ),
  }
}

/** The same selection, shifted by `offset` in the new document. */
function shiftSelection(tr: Transaction, selection: Selection, offset: number): void {
  if (selection instanceof NodeSelection) {
    tr.setSelection(NodeSelection.create(tr.doc, selection.from + offset))
  } else {
    tr.setSelection(
      TextSelection.create(tr.doc, selection.anchor + offset, selection.head + offset),
    )
  }
}

export const BlockKeys = Extension.create({
  name: 'blockKeys',
  // Before the defaults: ⌘↵ inserts a hard break otherwise.
  priority: 1000,

  addCommands() {
    return {
      moveBlock:
        (direction) =>
        ({ state, tr, dispatch }) => {
          const range = selectedBlocks(state)
          if (!range) return false
          const { parent, startIndex, endIndex } = range
          const { start, end, nodes } = rangeBounds(range)
          if (direction === 'up') {
            if (startIndex === 0) return false
            const previous = parent.child(startIndex - 1)
            const content = Fragment.from([...nodes, previous])
            if (!parent.canReplace(startIndex - 1, endIndex, content)) return false
            if (dispatch) {
              tr.replaceWith(start - previous.nodeSize, end, content)
              shiftSelection(tr, state.selection, -previous.nodeSize)
              dispatch(tr.scrollIntoView())
            }
            return true
          }
          if (endIndex >= parent.childCount) return false
          const next = parent.child(endIndex)
          const content = Fragment.from([next, ...nodes])
          if (!parent.canReplace(startIndex, endIndex + 1, content)) return false
          if (dispatch) {
            tr.replaceWith(start, end + next.nodeSize, content)
            shiftSelection(tr, state.selection, next.nodeSize)
            dispatch(tr.scrollIntoView())
          }
          return true
        },

      duplicateBlock:
        (direction) =>
        ({ state, tr, dispatch }) => {
          const range = selectedBlocks(state)
          if (!range) return false
          const { start, end, nodes } = rangeBounds(range)
          const content = Fragment.from(nodes)
          const at = direction === 'up' ? range.startIndex : range.endIndex
          if (!range.parent.canReplace(at, at, content)) return false
          if (dispatch) {
            // Down: the cursor goes to the copy (below). Up: the copy takes the original's place
            // above, and the cursor stays at the same positions (now in the copy).
            tr.insert(direction === 'up' ? start : end, content)
            shiftSelection(tr, state.selection, direction === 'up' ? 0 : end - start)
            dispatch(tr.scrollIntoView())
          }
          return true
        },

      deleteBlock:
        () =>
        ({ state, tr, dispatch }) => {
          const range = selectedBlocks(state)
          if (!range) return false
          if (dispatch) {
            const { start, end } = rangeBounds(range)
            // The last item of a list takes its list with it.
            const whole =
              LISTS.has(range.parent.type.name) &&
              range.startIndex === 0 &&
              range.endIndex === range.parent.childCount
            const from = whole ? start - 1 : start
            const to = whole ? end + 1 : end
            tr.delete(from, to)
            if (tr.doc.content.size === 0 || tr.doc.childCount === 0) {
              tr.insert(0, state.schema.nodes.paragraph!.create())
            }
            tr.setSelection(Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size))))
            dispatch(tr.scrollIntoView())
          }
          return true
        },

      insertBlock:
        (direction) =>
        ({ state, tr, dispatch }) => {
          const range = selectedBlocks(state)
          if (!range) return false
          const { start, end } = rangeBounds(range)
          // In a list, a new item of the same kind; elsewhere, an empty paragraph.
          const sibling = range.parent.child(
            direction === 'above' ? range.startIndex : range.endIndex - 1,
          )
          const node: ProseMirrorNode | null = LIST_ITEMS.has(sibling.type.name)
            ? sibling.type.createAndFill()
            : state.schema.nodes.paragraph!.create()
          const at = direction === 'above' ? range.startIndex : range.endIndex
          if (!node || !range.parent.canReplace(at, at, Fragment.from(node))) return false
          if (dispatch) {
            const pos = direction === 'above' ? start : end
            tr.insert(pos, node)
            tr.setSelection(Selection.near(tr.doc.resolve(pos + 1)))
            dispatch(tr.scrollIntoView())
          }
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        removeEmptyFirstLine(this.editor.state, (tr) => this.editor.view.dispatch(tr)),
      'Alt-ArrowUp': () => this.editor.commands.moveBlock('up'),
      'Alt-ArrowDown': () => this.editor.commands.moveBlock('down'),
      'Shift-Alt-ArrowUp': () => this.editor.commands.duplicateBlock('up'),
      'Shift-Alt-ArrowDown': () => this.editor.commands.duplicateBlock('down'),
      'Mod-Shift-k': () => this.editor.commands.deleteBlock(),
      'Mod-Enter': () => this.editor.commands.insertBlock('below'),
      'Mod-Shift-Enter': () => this.editor.commands.insertBlock('above'),
    }
  },
})
