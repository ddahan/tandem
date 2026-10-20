// Find and replace in the note (⌘F, as in VS Code): the matches of the query are highlighted,
// the current one more strongly and selected; next / previous wrap around; replace changes the
// current match, replace all every match. The find bar (FindBar.vue) drives it.
import { Extension, type CommandProps } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { scrollParent } from '../utils/current-heading'
import { findOccurrences, type Range } from './occurrences'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    find: {
      setFind: (query: string, options?: { caseSensitive?: boolean }) => ReturnType
      findNext: () => ReturnType
      findPrevious: () => ReturnType
      replaceMatch: (replacement: string) => ReturnType
      replaceAllMatches: (replacement: string) => ReturnType
      clearFind: () => ReturnType
    }
  }
}

export interface FindState {
  query: string
  caseSensitive: boolean
  matches: Range[]
  /** Index of the current match (-1: none). */
  current: number
}

const EMPTY: FindState = { query: '', caseSensitive: false, matches: [], current: -1 }

export const findKey = new PluginKey<FindState>('find')

export function findState(state: EditorState): FindState {
  return findKey.getState(state) ?? EMPTY
}

type FindMeta = Partial<Pick<FindState, 'query' | 'caseSensitive' | 'current'>> & {
  recompute?: boolean
}

/**
 * Scrolls the note to a match that is out of sight (a third down the view). ProseMirror's own
 * scroll to the selection does nothing while the find bar has the focus (it follows the
 * browser's selection, then in the find field).
 */
function reveal(view: EditorView, pos: number) {
  if (!view.dom.isConnected) return
  let coords: { top: number; bottom: number }
  try {
    coords = view.coordsAtPos(pos)
  } catch {
    return
  }
  const scroller = scrollParent(view.dom)
  if (!scroller) return
  const box = scroller.getBoundingClientRect()
  // Some room at the top: the find bar floats over the note there.
  const visible = coords.top >= box.top + 72 && coords.bottom <= box.bottom - 24
  if (!visible) scroller.scrollBy({ top: coords.top - (box.top + box.height / 3) })
}

/** The first match at or after `pos` (the cursor), wrapping around. */
function matchFrom(matches: Range[], pos: number): number {
  if (!matches.length) return -1
  const index = matches.findIndex((m) => m.from >= pos)
  return index === -1 ? 0 : index
}

/** Moves to the next (1) or previous (-1) match, wrapping around, and selects it. */
const go =
  (step: 1 | -1) =>
  () =>
  ({ state, tr, dispatch, view }: CommandProps) => {
    const { matches, current } = findState(state)
    if (!matches.length) return false
    const next = (current + step + matches.length) % matches.length
    const match = matches[next]!
    if (dispatch) {
      tr.setMeta(findKey, { current: next } satisfies FindMeta)
      tr.setSelection(TextSelection.create(tr.doc, match.from, match.to))
      dispatch(tr.scrollIntoView())
      reveal(view, match.from)
    }
    return true
  }

export const Find = Extension.create({
  name: 'find',

  addCommands() {
    return {
      setFind:
        (query, options = {}) =>
        ({ state, tr, dispatch, view }) => {
          if (dispatch) {
            const caseSensitive = options.caseSensitive ?? findState(state).caseSensitive
            const matches = findOccurrences(state.doc, query, { caseSensitive })
            // Start from the cursor, as VS Code does.
            const current = matchFrom(matches, state.selection.from)
            tr.setMeta(findKey, {
              query,
              caseSensitive,
              current,
              recompute: true,
            } satisfies FindMeta)
            const match = matches[current]
            if (match)
              tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView()
            dispatch(tr)
            if (match) reveal(view, match.from)
          }
          return true
        },
      findNext: go(1),
      findPrevious: go(-1),
      replaceMatch:
        (replacement) =>
        ({ state, tr, dispatch, view }) => {
          const { matches, current } = findState(state)
          const match = matches[current]
          if (!match) return false
          if (dispatch) {
            tr.insertText(replacement, match.from, match.to)
            // The next match takes the replaced one's index.
            tr.setMeta(findKey, { recompute: true, current } satisfies FindMeta)
            dispatch(tr)
            const following = findState(view.state)
            const next = following.matches[following.current]
            if (next) reveal(view, next.from)
          }
          return true
        },
      replaceAllMatches:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const { matches } = findState(state)
          if (!matches.length) return false
          if (dispatch) {
            for (const match of matches.toReversed())
              tr.insertText(replacement, match.from, match.to)
            tr.setMeta(findKey, { recompute: true, current: 0 } satisfies FindMeta)
            dispatch(tr)
          }
          return true
        },
      clearFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch)
            dispatch(tr.setMeta(findKey, { query: '', recompute: true } satisfies FindMeta))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => EMPTY,
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(findKey) as FindMeta | undefined
            if (!meta && !tr.docChanged) return value
            const query = meta?.query ?? value.query
            const caseSensitive = meta?.caseSensitive ?? value.caseSensitive
            if (!query) return { ...EMPTY, caseSensitive }
            if (!meta?.recompute && !tr.docChanged)
              return { ...value, current: meta?.current ?? value.current }
            const matches = findOccurrences(newState.doc, query, { caseSensitive })
            const wanted = meta?.current ?? value.current
            const current = matches.length ? Math.max(0, Math.min(wanted, matches.length - 1)) : -1
            return { query, caseSensitive, matches, current }
          },
        },
        props: {
          decorations(state) {
            const { matches, current } = findState(state)
            if (!matches.length) return null
            return DecorationSet.create(
              state.doc,
              matches.map((m, index) =>
                Decoration.inline(m.from, m.to, {
                  class: index === current ? 'find-match find-match--current' : 'find-match',
                }),
              ),
            )
          },
        },
      }),
    ]
  },
})
