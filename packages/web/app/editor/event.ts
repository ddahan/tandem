// An event placed in its day's note, where it was typed: a block naming it, whose details are in
// Tandem (see @tandem/shared's agenda.ts). In Markdown, a fenced block with only its ref:
//
//   ```event
//   id: Kx3fq9P2mZ0a
//   ```
//
// One unit in the text (an atom), moved with the editor's block handle; its line is
// `EventView.vue`, added by the editor component. Not draggable itself: Safari doesn't put the
// cursor in a field inside a draggable element (its title). In a daily note, a time typed at the start of an empty line, then a
// space (`14h `, `9:30 `), makes the line an event being typed (no ref yet: `text` holds what
// was typed), saved once it has a title; `/event` starts one with no time. A line dragged out
// of the agenda block is dropped as its event's block.
import { InputRule, Node, mergeAttributes } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { eventBlock } from '@tandem/shared'

/** The drag data of an agenda line: its event's ref (`checkRef`). */
export const EVENT_DRAG_TYPE = 'application/x-tandem-event'

export interface EventOptions {
  /** The note's day, or null when it isn't a daily note. */
  date: () => string | null
}

const BLOCK = /^```event[ \t]*\n[ \t]*id:[ \t]*([^\n]*?)[ \t]*\n```[ \t]*(?:\n|$)/

// A time that can't be a number of things (`3 apples`): with `h` or a colon.
const TYPED_TIME = /^(\d{1,2}(?::[0-5]\d|[hH](?:[0-5]\d)?)) $/

export const EventBlock = Node.create<EventOptions>({
  name: 'event',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { date: () => null }
  },

  addAttributes() {
    return {
      ref: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-event') ?? '',
        renderHTML: (attributes) => ({ 'data-event': attributes.ref as string }),
      },
      // An event being typed: what was typed so far (not kept in the Markdown as an event).
      text: { default: '', rendered: false },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-event]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'event' })]
  },

  markdownTokenizer: {
    name: 'event',
    level: 'block',
    start: (src: string) => {
      const match = /^```event[ \t]*$/m.exec(src)
      return match ? match.index : -1
    },
    tokenize(src: string) {
      const block = BLOCK.exec(src)
      const ref = block?.[1]
      return block && ref ? { type: 'event', raw: block[0], eventRef: ref } : undefined
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('event', { ref: token.eventRef as string })
  },

  renderMarkdown(node) {
    const ref = String(node.attrs?.ref ?? '')
    // Being typed: what was typed, as a line of text.
    return ref ? eventBlock(ref) : String(node.attrs?.text ?? '').trim()
  },

  addInputRules() {
    const date = () => this.options.date()
    const type = this.type
    return [
      new InputRule({
        find: TYPED_TIME,
        handler: ({ state, range, match }) => {
          if (!date()) return null
          // The rule's transaction: the typed space may be in the line already, or not yet.
          const tr = state.tr
          const $from = tr.doc.resolve(range.from)
          const paragraph = $from.parent
          // An empty line, right in the note (not in a list, a quote, a table…).
          if (paragraph.type.name !== 'paragraph' || $from.depth !== 1) return null
          if (paragraph.textContent.trim() !== match[1]) return null
          tr.replaceWith($from.before(), $from.after(), type.create({ ref: '', text: match[0] }))
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('eventDrop'),
        props: {
          handleDrop(view, event) {
            const ref = event.dataTransfer?.getData(EVENT_DRAG_TYPE)
            if (!ref || !view.editable) return false
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
              .insertContentAt(at.pos < middle ? block : after, { type: 'event', attrs: { ref } })
              .run()
            return true
          },
        },
      }),
    ]
  },
})

/** The refs of the events a document places. */
export function placedEvents(doc: ProseMirrorNode): Set<string> {
  const refs = new Set<string>()
  doc.descendants((node) => {
    if (node.type.name === 'event' && node.attrs.ref) refs.add(String(node.attrs.ref))
    return node.type.name !== 'event'
  })
  return refs
}

/** Whether a document has an event being typed (no ref yet). */
export function typingEvent(doc: ProseMirrorNode): boolean {
  let found = false
  doc.descendants((node) => {
    if (node.type.name === 'event' && !node.attrs.ref) found = true
    return !found && node.type.name !== 'event'
  })
  return found
}
