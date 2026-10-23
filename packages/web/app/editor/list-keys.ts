// The keys of lists, as one set of rules, whatever the kinds (each level of a list has one kind,
// any kind at any level):
// - Tab: one level in, under the item above; into its sub-items when it has some (taking
//   their kind), otherwise a new sub-list of the item's kind. Only the line moves: its own
//   sub-items stay where they are, now right after it in its new level (of its kind). The first
//   item of a list stays (Tab never leaves the editor from a list).
// - Shift+Tab, Enter in an empty item, Backspace at the start of an item: one level out. The
//   item becomes an item of the level above, of that level's kind (the items after it become
//   its sub-items); from the top level, a plain paragraph.
// - Backspace at the start of a paragraph just after a list: joins it to the end of the list's
//   last line (ProseMirror would put it back in the list as an item).
// - Delete at the end of an item's line, before its sub-items: the first one comes one level
//   out (then Delete joins it, as between items of a level).
// TipTap's own keys look for the nearest item of *their* type: in a bullet item nested in a
// to-do, Shift+Tab lifted the to-do itself; between a to-do and a bullet level, items became
// unmarked lines; Backspace could go back and forth between an item and a line, forever.
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list'

const ITEMS = new Set(['listItem', 'taskItem'])
const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])

interface ItemAt {
  /** Depth of the item holding the cursor's paragraph. */
  depth: number
  item: ProseMirrorNode
  list: ProseMirrorNode
}

/** The list item whose own paragraph holds the cursor (its first one, with `firstLine`). */
function itemAt($pos: ResolvedPos, firstLine = false): ItemAt | null {
  const depth = $pos.depth - 1
  if (depth < 2) return null
  const item = $pos.node(depth)
  if (!ITEMS.has(item.type.name)) return null
  if (firstLine && $pos.index(depth) !== 0) return null
  return { depth, item, list: $pos.node(depth - 1) }
}

function itemTypeName(listName: string): 'taskItem' | 'listItem' {
  return listName === 'taskList' ? 'taskItem' : 'listItem'
}

/** The item as an item of another kind (a new to-do is unchecked), with the same content. */
function convertItem(state: EditorState, item: ProseMirrorNode, listName: string) {
  const type = state.schema.nodes[itemTypeName(listName)]!
  if (type === item.type) return item
  return type.create(type.name === 'taskItem' ? { checked: false } : null, item.content)
}

type Dispatch = ((tr: Transaction) => void) | undefined

/** One level out (see the top). */
function outdent(state: EditorState, dispatch: Dispatch): boolean {
  const { $from } = state.selection
  const at = itemAt($from)
  if (!at) return false
  const { depth, item, list } = at
  const parent = depth >= 3 ? $from.node(depth - 2) : null
  // Top level, or into an item of the same type (bullet ↔ numbered): ProseMirror's lift does it
  // (the level's kind comes with the list the item moves into).
  if (!parent || !ITEMS.has(parent.type.name) || parent.type === item.type) {
    return liftListItem(item.type)(state, dispatch)
  }
  // Between a to-do level and a bullet or numbered one: the item changes type.
  if (!dispatch) return true
  const tr = state.tr
  const index = $from.index(depth - 1)
  const itemStart = $from.before(depth)
  const offset = $from.pos - itemStart
  // The items after it become its sub-items (as ProseMirror's lift does).
  const followers: ProseMirrorNode[] = []
  for (let i = index + 1; i < list.childCount; i++) followers.push(list.child(i))
  let content = item.content
  if (followers.length) content = content.addToEnd(list.type.create(list.attrs, followers))
  const parentList = $from.node(depth - 3)
  const moved = convertItem(state, item.type.create(item.attrs, content), parentList.type.name)
  // Remove it (with its followers; the whole list when it was the first item), then add it
  // after its parent item.
  const insertAt = $from.after(depth - 2)
  const removeFrom = index === 0 ? $from.before(depth - 1) : itemStart
  const removeTo = $from.after(depth - 1) - (index === 0 ? 0 : 1)
  tr.insert(insertAt, moved)
  tr.delete(removeFrom, removeTo)
  const at2 = tr.mapping.slice(1).map(insertAt)
  tr.setSelection(TextSelection.create(tr.doc, at2 + offset))
  dispatch(tr.scrollIntoView())
  return true
}

/** One level in (see the top). */
function indent(state: EditorState, dispatch: Dispatch): boolean {
  const { $from, $to } = state.selection
  const at = itemAt($from)
  if (!at) return false
  const { depth, item } = at
  const index = $from.index(depth - 1)
  // The first item of a list has nothing above to go under: it stays (and the key is taken,
  // so that the focus doesn't leave the editor).
  if (index === 0) return true
  const above = $from.node(depth - 1).child(index - 1)
  const sub = above.lastChild
  // The item above has sub-items of another kind: the item joins them, taking their kind.
  if (sub && LISTS.has(sub.type.name) && sub.type !== at.list.type && $from.sameParent($to)) {
    if (!dispatch) return true
    const tr = state.tr
    const itemStart = $from.before(depth)
    const offset = $from.pos - itemStart
    // The end of the sub-list, inside it: just before the item above closes.
    const subEnd = itemStart - 2
    tr.insert(subEnd, convertItem(state, item, sub.type.name))
    tr.delete(itemStart + item.nodeSize, itemStart + 2 * item.nodeSize)
    tr.setSelection(TextSelection.create(tr.doc, subEnd + offset))
    dispatch(tr.scrollIntoView())
    return true
  }
  return sinkListItem(item.type)(state, dispatch) || true
}

/** Tab: one level in, the line alone (see the top): its sub-items are taken out first, then
 * put back right after it, in the level it moved into. */
function indentLine(state: EditorState, dispatch: Dispatch): boolean {
  const { $from, $to } = state.selection
  const at = itemAt($from)
  if (!at || $from.index(at.depth - 1) === 0) return indent(state, dispatch)
  const { depth, item } = at
  const sub = item.childCount > 1 ? item.lastChild : null
  if (!sub || !LISTS.has(sub.type.name) || !$from.sameParent($to)) return indent(state, dispatch)
  if (!dispatch) return true
  // Without its sub-items, then one level in.
  const tr = state.tr
  const subStart = $from.before(depth) + item.nodeSize - 1 - sub.nodeSize
  tr.delete(subStart, subStart + sub.nodeSize)
  let moved: Transaction | null = null
  indent(state.apply(tr), (next) => (moved = next))
  if (!moved) return true
  const indented: Transaction = moved
  for (const step of indented.steps) tr.step(step)
  // Right after it, in its new level, of that level's kind.
  const $cursor = tr.doc.resolve(indented.selection.from)
  const itemDepth = $cursor.depth - 1
  const level = $cursor.node(itemDepth - 1)
  const children: ProseMirrorNode[] = []
  sub.forEach((child) => children.push(convertItem(state, child, level.type.name)))
  tr.insert($cursor.after(itemDepth), children)
  tr.setSelection(TextSelection.create(tr.doc, indented.selection.from))
  dispatch(tr.scrollIntoView())
  return true
}

/** Enter in an empty item (with no sub-items): one level out. */
function leaveEmptyItem(state: EditorState, dispatch: Dispatch): boolean {
  const { $from, empty } = state.selection
  const at = itemAt($from, true)
  if (!empty || !at || $from.parent.content.size > 0 || at.item.childCount > 1) return false
  return outdent(state, dispatch)
}

/** Backspace at the start of an item's text, or of a paragraph just after a list. */
function backspace(state: EditorState, dispatch: Dispatch): boolean {
  const { $from, empty } = state.selection
  if (!empty || $from.parentOffset > 0 || !$from.parent.isTextblock) return false
  if (itemAt($from, true)) return outdent(state, dispatch)
  const before = state.doc.resolve($from.before()).nodeBefore
  if (!before || !LISTS.has(before.type.name)) return false
  // The end of the list's last line.
  const end = Selection.findFrom(state.doc.resolve($from.before()), -1, true)
  if (!end) return false
  if (!dispatch) return true
  const tr = state.tr
  tr.delete($from.before(), $from.after())
  tr.insert(end.from, $from.parent.content)
  tr.setSelection(TextSelection.create(tr.doc, end.from))
  dispatch(tr.scrollIntoView())
  return true
}

/** Delete at the end of an item's line, just before its sub-items. */
function deleteForward(state: EditorState, dispatch: Dispatch): boolean {
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock || $from.parentOffset < $from.parent.content.size) {
    return false
  }
  if ($from.depth < 2 || !ITEMS.has($from.node(-1).type.name)) return false
  const after = state.doc.resolve($from.after()).nodeAfter
  if (!after || !LISTS.has(after.type.name)) return false
  // As if the cursor were at the start of that first sub-item: list, item, paragraph.
  const inside = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, $from.after() + 3)),
  )
  return outdent(inside, (tr) => {
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map($from.pos)))
    dispatch?.(tr)
  })
}

export const ListKeys = Extension.create({
  name: 'listKeys',
  // Before TipTap's list keys (100).
  priority: 1000,

  addKeyboardShortcuts() {
    const run = (command: (state: EditorState, dispatch: Dispatch) => boolean) => () =>
      command(this.editor.state, (tr) => this.editor.view.dispatch(tr))
    return {
      Tab: run(indentLine),
      'Shift-Tab': run(outdent),
      Enter: run(leaveEmptyItem),
      Backspace: () => this.editor.commands.undoInputRule() || run(backspace)(),
      Delete: run(deleteForward),
    }
  },
})
