// Databases in a note: a block naming a database whose data lives in SQLite (see
// @tandem/shared's databases.ts). In Markdown, a fenced block with only the id:
//
//   ```database
//   id: Kx3fq9P2mZ0a
//   ```
//
// One unit in the text (an atom: selected, moved, deleted whole); its table is drawn by
// `DatabaseView.vue`, added by the editor component.
import { Node, mergeAttributes } from '@tiptap/core'
import { databaseBlock } from '@tandem/shared'

const BLOCK = /^```database[ \t]*\n([\s\S]*?)\n```[ \t]*(?:\n|$)/

export const Database = Node.create({
  name: 'database',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-database-id') ?? '',
        renderHTML: (attributes) => ({ 'data-database-id': attributes.id as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-database-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'database' })]
  },

  markdownTokenizer: {
    name: 'database',
    level: 'block',
    start: (src: string) => {
      const match = /^```database[ \t]*$/m.exec(src)
      return match ? match.index : -1
    },
    tokenize(src: string) {
      const block = BLOCK.exec(src)
      const id = block && /^id:[ \t]*(\S+)[ \t]*$/m.exec(block[1] ?? '')?.[1]
      if (!block || !id) return undefined
      return { type: 'database', raw: block[0], databaseId: id }
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('database', { id: token.databaseId as string })
  },

  renderMarkdown(node) {
    return databaseBlock(String(node.attrs?.id ?? ''))
  },
})
