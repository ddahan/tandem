import { describe, expect, it } from 'vitest'
import {
  actedOn,
  clickRow,
  emptySelection,
  isSelected,
  shownIds,
} from '../app/utils/tree-selection'

const plain = { metaKey: false, ctrlKey: false, shiftKey: false }
const meta = { ...plain, metaKey: true }
const shift = { ...plain, shiftKey: true }
const shown = ['a', 'b', 'c', 'd', 'e']

describe('selecting rows of a tree', () => {
  it('adds and takes out rows with ⌘, starting from the open one', () => {
    let { selection, selecting } = clickRow(emptySelection(), meta, 'c', shown, 'a')
    expect(selecting).toBe(true)
    expect(selection.ids).toEqual(['a', 'c'])
    ;({ selection } = clickRow(selection, { ...plain, ctrlKey: true }, 'd', shown, 'a'))
    expect(selection.ids).toEqual(['a', 'c', 'd'])
    ;({ selection } = clickRow(selection, meta, 'a', shown, 'a'))
    expect(selection.ids).toEqual(['c', 'd'])
    expect(isSelected(selection, 'c')).toBe(true)
    expect(isSelected(selection, 'a')).toBe(false)
    // Nothing open, or the open one clicked: it alone, which isn't a selection yet.
    expect(clickRow(emptySelection(), meta, 'b', shown, null).selection.ids).toEqual(['b'])
    expect(isSelected(clickRow(emptySelection(), meta, 'b', shown, 'b').selection, 'b')).toBe(false)
  })

  it('selects a range with ⇧, from the last row clicked (or the open one)', () => {
    let { selection } = clickRow(emptySelection(), shift, 'd', shown, 'b')
    expect(selection.ids).toEqual(['b', 'c', 'd'])
    // Again: from the same start.
    ;({ selection } = clickRow(selection, shift, 'a', shown, 'b'))
    expect(selection.ids).toEqual(['a', 'b'])
    // A plain click starts again: nothing selected, the next range from there.
    const after = clickRow(selection, plain, 'e', shown, 'b')
    expect(after).toEqual({ selection: { ids: [], anchor: 'e' }, selecting: false })
    expect(clickRow(after.selection, shift, 'c', shown, 'e').selection.ids).toEqual(['c', 'd', 'e'])
    // A row not shown: it alone.
    expect(clickRow(emptySelection(), shift, 'z', shown, 'a').selection.ids).toEqual(['z'])
  })

  it('acts on the selection from a row in it, without what a selected folder holds', () => {
    const parents: Record<string, string> = { b: 'a', c: 'b' }
    const isWithin = (id: string, folder: string) => {
      for (let at: string | undefined = id; at; at = parents[at]) if (at === folder) return true
      return false
    }
    const selection = { ids: ['a', 'c', 'd'], anchor: 'd' }
    expect(actedOn(selection, 'd', isWithin)).toEqual(['a', 'd'])
    expect(actedOn(selection, 'e', isWithin)).toEqual(['e'])
    expect(actedOn({ ids: ['d'], anchor: 'd' }, 'd', isWithin)).toEqual(['d'])
  })

  it('lists the rows as they show, folded ones left out', () => {
    interface Item {
      id: string
      children?: Item[]
    }
    const items: Item[] = [
      { id: 'a', children: [{ id: 'b', children: [{ id: 'c' }] }] },
      { id: 'd', children: [{ id: 'e' }] },
    ]
    expect(shownIds(items, ['a'])).toEqual(['a', 'b', 'd'])
    expect(shownIds(items, ['a', 'b', 'd'])).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
