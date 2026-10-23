// A day's agenda in its daily note: a block holding no data, which shows that day's events (kept
// in Tandem, see @tandem/shared's agenda.ts) not placed in the note (editor/event.ts). In
// Markdown, an empty fenced block:
//
//   ```agenda
//   ```
//
// One unit in the text (an atom) that can be dragged elsewhere in the note; its view is
// `AgendaView.vue`, added by the editor component. The day comes from the note (`date`): the
// block shows nothing outside a daily note, or with no event left to show.
import { Node, mergeAttributes } from '@tiptap/core'
import { AGENDA_BLOCK } from '@tandem/shared'

export interface AgendaOptions {
  /** The note's day, or null when it isn't a daily note. */
  date: () => string | null
}

const BLOCK = /^```agenda[ \t]*\n(?:[^\n]*\n)*?```[ \t]*(?:\n|$)/

export const Agenda = Node.create<AgendaOptions>({
  name: 'agenda',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { date: () => null }
  },

  parseHTML() {
    return [{ tag: 'div[data-agenda]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-agenda': '', class: 'agenda' })]
  },

  markdownTokenizer: {
    name: 'agenda',
    level: 'block',
    start: (src: string) => {
      const match = /^```agenda[ \t]*$/m.exec(src)
      return match ? match.index : -1
    },
    tokenize(src: string) {
      const block = BLOCK.exec(src)
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
