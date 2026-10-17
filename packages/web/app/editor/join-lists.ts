// Merges lists of the same kind that end up next to each other (dragging an item just below
// its list, deleting the paragraph between two lists…). Two adjacent lists would be saved as
// one "loose" Markdown list, with blank lines between its items.
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { canJoin } from '@tiptap/pm/transform'

const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])

/** Positions between two adjacent lists of the same type, deepest and last first. */
export function adjacentListBoundaries(doc: ProseMirrorNode): number[] {
  const boundaries: number[] = []
  const walk = (node: ProseMirrorNode, contentStart: number) => {
    let position = contentStart
    let previous: ProseMirrorNode | null = null
    node.forEach((child) => {
      if (previous && previous.type === child.type && LISTS.has(child.type.name))
        boundaries.push(position)
      if (!child.isLeaf) walk(child, position + 1)
      previous = child
      position += child.nodeSize
    })
  }
  walk(doc, 0)
  return boundaries.toSorted((a, b) => b - a)
}

export const JoinLists = Extension.create({
  name: 'joinLists',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('joinLists'),
        appendTransaction(transactions, _oldState, state) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null
          const boundaries = adjacentListBoundaries(state.doc)
          if (!boundaries.length) return null
          const tr = state.tr
          for (const position of boundaries) {
            if (canJoin(tr.doc, position)) tr.join(position)
          }
          return tr.docChanged ? tr : null
        },
      }),
    ]
  },
})
