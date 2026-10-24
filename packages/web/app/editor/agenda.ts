// Blocks of an earlier agenda, which lived in the notes' text: ` ```agenda ` (the day's events)
// and ` ```event ` with `id: …` (an event placed in the note). The agenda is now above a daily
// note (DayAgenda), never in its Markdown. Such blocks are read, so that they don't show as code
// blocks, and drawn as nothing; a daily note drops them as it opens (NoteEditor). Elsewhere they
// are kept as written.
import { Node, mergeAttributes } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { AGENDA_BLOCK, eventBlock } from '@tandem/shared'

const AGENDA = /^```agenda[ \t]*\n(?:[^\n]*\n)*?```[ \t]*(?:\n|$)/
const EVENT = /^```event[ \t]*\n[ \t]*id:[ \t]*([^\n]*?)[ \t]*\n```[ \t]*(?:\n|$)/

export const OldAgenda = Node.create({
  name: 'agenda',
  group: 'block',
  atom: true,

  parseHTML() {
    return [{ tag: 'div[data-agenda]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-agenda': '', hidden: '' })]
  },

  markdownTokenizer: {
    name: 'agenda',
    level: 'block',
    start: (src: string) => {
      const match = /^```agenda[ \t]*$/m.exec(src)
      return match ? match.index : -1
    },
    tokenize(src: string) {
      const block = AGENDA.exec(src)
      return block ? { type: 'agenda', raw: block[0] } : undefined
    },
  },

  parseMarkdown(_token, helpers) {
    return helpers.createNode('agenda')
  },

  renderMarkdown() {
    return AGENDA_BLOCK
  },
})

export const OldEvent = Node.create({
  name: 'event',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      ref: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-event') ?? '',
        renderHTML: (attributes) => ({ 'data-event': attributes.ref as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-event]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { hidden: '' })]
  },

  markdownTokenizer: {
    name: 'event',
    level: 'block',
    start: (src: string) => {
      const match = /^```event[ \t]*$/m.exec(src)
      return match ? match.index : -1
    },
    tokenize(src: string) {
      const block = EVENT.exec(src)
      const ref = block?.[1]
      return block && ref ? { type: 'event', raw: block[0], eventRef: ref } : undefined
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('event', { ref: token.eventRef as string })
  },

  renderMarkdown(node) {
    return eventBlock(String(node.attrs?.ref ?? ''))
  },
})

/** Removes the old agenda and event blocks of a document; false when it had none. */
export function dropOldAgenda(doc: ProseMirrorNode, tr: Transaction): boolean {
  doc.descendants((node, pos) => {
    if (node.type.name === 'agenda' || node.type.name === 'event') {
      tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize))
      return false
    }
    return true
  })
  return tr.docChanged
}
