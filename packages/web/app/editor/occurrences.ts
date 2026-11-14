// VS Code's ⌘D: the first press selects the word at the cursor, each next press adds the next
// occurrence of the selection; ⌘⇧L adds all of them. Typing, Backspace and Delete then apply to
// every occurrence, and the arrows move every cursor (⇧ selects, ⌥ by word, ⌘ to the line's
// start or end; Ctrl for words outside macOS, Home and End too). Esc or a click goes back to a
// single selection.
//
// ProseMirror has one selection: the extra ones are kept here (mapped through every change) and
// drawn as decorations. Keys are listed on the Shortcuts page (utils/shortcuts.ts).
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { isMac } from '../utils/platform-keys'

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
  /** Selected from the end (⇧←): its moving end is `from`. */
  backward?: boolean
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

// --- Moving every cursor (arrows) ------------------------------------------------------------

/** How far an arrow moves: a character, a word, to the line's edge, or a line up or down. */
export type Unit = 'char' | 'word' | 'lineEdge' | 'line'

export interface Motion {
  unit: Unit
  /** -1: left or up; 1: right or down. */
  dir: -1 | 1
  /** ⇧: the selection grows from its fixed end. */
  extend: boolean
}

/** The motion of a key, as VS Code moves its cursors; null for keys that aren't one. */
export function motionOf(event: KeyboardEvent, mac = isMac()): Motion | null {
  const { key, shiftKey: extend, altKey, ctrlKey, metaKey } = event
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'
  const dir = key === 'ArrowLeft' || key === 'ArrowUp' || key === 'Home' ? -1 : 1
  if (key === 'Home' || key === 'End') {
    return altKey || ctrlKey || metaKey ? null : { unit: 'lineEdge', dir, extend }
  }
  if (horizontal) {
    const word = mac ? altKey && !ctrlKey && !metaKey : ctrlKey && !altKey && !metaKey
    const edge = mac && metaKey && !altKey && !ctrlKey
    if (word) return { unit: 'word', dir, extend }
    if (edge) return { unit: 'lineEdge', dir, extend }
    return altKey || ctrlKey || metaKey ? null : { unit: 'char', dir, extend }
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    // ⌥↑ moves the block, ⌘↑ goes to the note's start: not for every cursor.
    return altKey || ctrlKey || metaKey ? null : { unit: 'line', dir, extend }
  }
  return null
}

const isWordChar = (char: string | undefined) => !!char && /[\p{L}\p{N}_]/u.test(char)
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

/** The nearest text position in the textblock after (or before) the one holding `pos`. */
function acrossBlocks(doc: ProseMirrorNode, pos: number, dir: -1 | 1): number {
  const $pos = doc.resolve(pos)
  if (!$pos.parent.isTextblock) return pos
  const edge = doc.resolve(dir > 0 ? $pos.after() : $pos.before())
  return Selection.findFrom(edge, dir, true)?.head ?? pos
}

/**
 * Where a cursor at `pos` goes by a character or a word (VS Code's ⌥→: to the end of the next
 * word; ⌥←: to the start of the previous one). From a line's edge, to the next or previous line.
 */
export function moveInText(
  doc: ProseMirrorNode,
  pos: number,
  dir: -1 | 1,
  unit: 'char' | 'word',
): number {
  const $pos = doc.resolve(pos)
  if (!$pos.parent.isTextblock) return pos
  // One character per position: inline leaves (links to notes, line breaks) count as one.
  const text = $pos.parent.textBetween(0, $pos.parent.content.size, undefined, '￼')
  let offset = $pos.parentOffset
  if (dir < 0 ? offset === 0 : offset === text.length) return acrossBlocks(doc, pos, dir)
  if (unit === 'char') {
    offset += dir
    // Not between the two halves of an emoji.
    if (offset > 0 && offset < text.length && isLowSurrogate(text.charCodeAt(offset))) {
      offset += dir
    }
  } else if (dir > 0) {
    while (offset < text.length && !isWordChar(text[offset])) offset++
    while (offset < text.length && isWordChar(text[offset])) offset++
  } else {
    while (offset > 0 && !isWordChar(text[offset - 1])) offset--
    while (offset > 0 && isWordChar(text[offset - 1])) offset--
  }
  return $pos.start() + offset
}

/** The start or end of the line (as shown, wrapped) holding `pos`. */
function lineEdge(view: EditorView, pos: number, dir: -1 | 1): number {
  const $pos = view.state.doc.resolve(pos)
  if (!$pos.parent.isTextblock) return pos
  const [start, end] = [$pos.start(), $pos.end()]
  try {
    const top = (at: number, side: -1 | 1) => view.coordsAtPos(at, side).top
    const line = top(pos, pos === end ? -1 : 1)
    let at = pos
    if (dir > 0) while (at < end && Math.abs(top(at + 1, -1) - line) < 2) at++
    else while (at > start && Math.abs(top(at - 1, 1) - line) < 2) at--
    return at
  } catch {
    // Not laid out (no layout to measure): the paragraph's edge.
    return dir > 0 ? end : start
  }
}

/** The first (or last) place for a cursor in the note. */
function noteEdge(doc: ProseMirrorNode, dir: -1 | 1): number {
  const at = doc.resolve(dir < 0 ? 0 : doc.content.size)
  return Selection.findFrom(at, -dir as -1 | 1, true)?.head ?? at.pos
}

/**
 * The cursor a line up or down: the place under it on the line above or below (as shown),
 * looked for in steps of half a line (the space between two blocks is no line). From the first
 * line up: the note's start; from the last one down: its end. A cursor out of sight (nothing
 * to measure there) goes to the same column of the previous or next paragraph.
 */
function lineMove(view: EditorView, pos: number, dir: -1 | 1): number {
  const { doc } = view.state
  try {
    const from = view.coordsAtPos(pos)
    const box = view.dom.getBoundingClientRect()
    const step = Math.max(2, (from.bottom - from.top) / 2)
    for (let y = dir < 0 ? from.top - step : from.bottom + step; ; y += dir * step) {
      if (dir < 0 ? y < box.top : y > box.bottom) return noteEdge(doc, dir)
      if (y < 0 || y > window.innerHeight) break
      const found = view.posAtCoords({ left: from.left, top: y })
      if (!found || !doc.resolve(found.pos).parent.isTextblock) continue
      const to = view.coordsAtPos(found.pos)
      if (dir < 0 ? to.bottom <= from.top + 1 : to.top >= from.bottom - 1) return found.pos
    }
  } catch {
    // Not laid out: by paragraphs, below.
  }
  const $pos = doc.resolve(pos)
  if (!$pos.parent.isTextblock) return pos
  const next = acrossBlocks(doc, pos, dir)
  if (next === pos) return noteEdge(doc, dir)
  const $next = doc.resolve(next)
  return $next.start() + Math.min($pos.parentOffset, $next.parent.content.size)
}

/** A range as anchor (fixed end) and head (moving end). */
const endsOf = (range: Range) =>
  range.backward ? { anchor: range.to, head: range.from } : { anchor: range.from, head: range.to }

function rangeFrom(anchor: number, head: number): Range {
  return head < anchor ? { from: head, to: anchor, backward: true } : { from: anchor, to: head }
}

/** Where a range goes with a motion (`to`: where its head goes, by the unit). */
export function moveRange(range: Range, motion: Motion, to: (head: number) => number): Range {
  const { anchor, head } = endsOf(range)
  if (motion.extend) return rangeFrom(anchor, to(head))
  // A selection collapses to its start (←) or end (→); ↑ ↓ go from its head.
  if (range.from !== range.to && motion.unit === 'char') {
    const at = motion.dir < 0 ? range.from : range.to
    return { from: at, to: at }
  }
  const at = to(head)
  return { from: at, to: at }
}

/**
 * Ranges merged where they meet, as VS Code does: two cursors that end in the same place are
 * one, overlapping selections one selection. The main one (index 0) keeps its place first.
 */
export function mergeRanges(ranges: Range[]): Range[] {
  const merged: Range[] = []
  for (const range of ranges) {
    const overlapping = merged.find((other) =>
      range.from === range.to || other.from === other.to
        ? range.from === other.from && range.to === other.to
        : range.from < other.to && other.from < range.to,
    )
    if (!overlapping) {
      merged.push(range)
      continue
    }
    overlapping.from = Math.min(overlapping.from, range.from)
    overlapping.to = Math.max(overlapping.to, range.to)
  }
  return merged
}

/** Moves the main selection and every extra one; false when there are no extra ones. */
function moveAll(view: EditorView, motion: Motion): boolean {
  const { state } = view
  const extras = extraSelections(state)
  if (!extras.length) return false
  const { selection, doc } = state
  const main = rangeFrom(selection.anchor, selection.head)
  const to = (head: number) => {
    if (motion.unit === 'lineEdge') return lineEdge(view, head, motion.dir)
    if (motion.unit === 'line') return lineMove(view, head, motion.dir)
    return moveInText(doc, head, motion.dir, motion.unit)
  }
  const [first, ...others] = mergeRanges([main, ...extras].map((r) => moveRange(r, motion, to)))
  const { anchor, head } = endsOf(first!)
  const tr = state.tr.setSelection(TextSelection.create(doc, anchor, head))
  view.dispatch(withExtras(tr, others).scrollIntoView())
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
  // Before the other keys (block and list keys): with several cursors, the arrows move them all.
  priority: 1100,

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
            // Moving the selection otherwise (a click, keys the cursors don't follow): one again.
            if (tr.selectionSet && !tr.docChanged) return []
            if (!tr.docChanged) return ranges
            return ranges.map((r) => ({
              ...r,
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
          handleKeyDown(view, event) {
            if (event.isComposing || !extraSelections(view.state).length) return false
            const motion = motionOf(event)
            return !!motion && moveAll(view, motion)
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
