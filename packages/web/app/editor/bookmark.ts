// Bookmarks in a note: a block naming a bookmark whose data lives in SQLite (see
// @tandem/shared's bookmarks.ts), drawn as a card. In Markdown, a fenced block with only the id:
//
//   ```bookmark
//   id: Kx3fq9P2mZ0a
//   ```
//
// One unit in the text (an atom), as databases; its card is `BookmarkView.vue`, added by the
// editor component. A bookmark dragged from the sidebar is dropped as its card.
import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { bookmarkBlock } from '@tandem/shared'

/** The drag data of a bookmark from the sidebar: its id. */
export const BOOKMARK_DRAG_TYPE = 'application/x-tandem-bookmark'

const BLOCK = /^```bookmark[ \t]*\n([\s\S]*?)\n```[ \t]*(?:\n|$)/

export const Bookmark = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-bookmark-id') ?? '',
        renderHTML: (attributes) => ({ 'data-bookmark-id': attributes.id as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-bookmark-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'bookmark' })]
  },

  markdownTokenizer: {
    name: 'bookmark',
    level: 'block',
    start: (src: string) => {
      const match = /^```bookmark[ \t]*$/m.exec(src)
      return match ? match.index : -1
    },
    tokenize(src: string) {
      const block = BLOCK.exec(src)
      const id = block && /^id:[ \t]*(\S+)[ \t]*$/m.exec(block[1] ?? '')?.[1]
      if (!block || !id) return undefined
      return { type: 'bookmark', raw: block[0], bookmarkId: id }
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('bookmark', { id: token.bookmarkId as string })
  },

  renderMarkdown(node) {
    return bookmarkBlock(String(node.attrs?.id ?? ''))
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('bookmarkDrop'),
        props: {
          handleDrop(view, event) {
            const id = event.dataTransfer?.getData(BOOKMARK_DRAG_TYPE)
            if (!id || !view.editable) return false
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (!at) return false
            event.preventDefault()
            // Before or after the block it's dropped on, as the cursor would land there.
            const $pos = view.state.doc.resolve(at.pos)
            const block = $pos.depth > 0 ? $pos.before(1) : at.pos
            const after = $pos.depth > 0 ? $pos.after(1) : at.pos
            const node = $pos.depth > 0 ? view.state.doc.nodeAt(block) : null
            const middle = node ? block + node.nodeSize / 2 : at.pos
            editor
              .chain()
              .insertContentAt(at.pos < middle ? block : after, { type: 'bookmark', attrs: { id } })
              .run()
            return true
          },
        },
      }),
    ]
  },
})
