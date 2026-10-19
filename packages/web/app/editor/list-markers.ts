// List markers typed at the start of a list item of another kind: `[ ] ` (or `[x] `) in a bullet
// or numbered item, `- ` in a to-do or numbered item, `1. ` in a bullet or to-do item. TipTap's
// own rules would wrap the item's text in a new list inside the item, which the schema forbids
// (an item starts with its text), so nothing happened. Here the item's list changes kind, as
// with the slash menu: a Markdown list is of one kind, so its other items change too.
import { Extension, InputRule } from '@tiptap/core'

const ITEMS = new Set(['listItem', 'taskItem'])

type ListKind = 'bulletList' | 'orderedList' | 'taskList'

function markerRule(find: RegExp, kind: ListKind) {
  return new InputRule({
    find,
    handler: ({ state, range, match, chain }) => {
      const $from = state.doc.resolve(range.from)
      const item = $from.node(-1)
      const list = $from.node(-2)
      // Only at the start of an item's own text, in a list of another kind.
      if (!ITEMS.has(item?.type.name ?? '') || item.firstChild !== $from.parent) return null
      if (!list || list.type.name === kind) return null
      const commands = chain().deleteRange(range)
      if (kind === 'taskList') {
        commands
          .toggleTaskList()
          .updateAttributes('taskItem', { checked: match[1]?.toLowerCase() === 'x' })
      } else if (kind === 'bulletList') {
        commands.toggleBulletList()
      } else {
        commands.toggleOrderedList()
      }
      commands.run()
    },
  })
}

export const ListMarkers = Extension.create({
  name: 'listMarkers',

  addInputRules() {
    return [
      markerRule(/^\s*\[([ x])\]\s$/i, 'taskList'),
      markerRule(/^\s*[-+*]\s$/, 'bulletList'),
      markerRule(/^\s*\d+\.\s$/, 'orderedList'),
    ]
  },
})
