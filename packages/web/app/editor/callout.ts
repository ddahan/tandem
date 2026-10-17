// Callouts, as GitHub writes them: a quote whose first line is `[!NOTE]`, `[!TIP]`,
// `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]`. Agents and GitHub render them the same way.
import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core'

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (type?: CalloutType) => ReturnType
      setCalloutType: (type: CalloutType) => ReturnType
    }
  }
}

const FIRST_LINE = /^ {0,3}> ?\[!(\w+)\][ \t]*(.*)$/

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: (element) => element.getAttribute('data-callout') ?? 'note',
        renderHTML: (attributes) => ({ 'data-callout': attributes.type as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'callout' }), 0]
  },

  addCommands() {
    return {
      setCallout:
        (type = 'note') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { type }),
      setCalloutType:
        (type) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { type }),
    }
  },

  addInputRules() {
    // `> [!tip] ` at the start of a line.
    return [
      wrappingInputRule({
        find: /^>\s?\[!(\w+)\]\s$/,
        type: this.type,
        getAttributes: (match) => {
          const type = match[1]?.toLowerCase() as CalloutType
          return { type: CALLOUT_TYPES.includes(type) ? type : 'note' }
        },
      }),
    ]
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => {
      const match = /^ {0,3}> ?\[!\w+\]/m.exec(src)
      return match ? match.index : -1
    },
    tokenize(src: string, _tokens, lexer) {
      const block = /^(?: {0,3}>[^\n]*(?:\n|$))+/.exec(src)
      if (!block) return undefined
      const lines = block[0].replace(/\n$/, '').split('\n')
      const first = FIRST_LINE.exec(lines[0] ?? '')
      if (!first) return undefined
      const type = first[1]!.toLowerCase()
      const inner = [
        first[2] ?? '',
        ...lines.slice(1).map((line) => line.replace(/^ {0,3}> ?/, '')),
      ]
        .join('\n')
        .replace(/^\n+/, '')
      return {
        type: 'callout',
        raw: block[0],
        calloutType: CALLOUT_TYPES.includes(type as CalloutType) ? type : 'note',
        tokens: lexer.blockTokens(inner),
      }
    },
  },

  parseMarkdown(token, helpers) {
    const content = helpers.parseChildren(token.tokens ?? [])
    return helpers.createNode(
      'callout',
      { type: token.calloutType as string },
      content.length ? content : [helpers.createNode('paragraph')],
    )
  },

  renderMarkdown(node, helpers) {
    const body = helpers.renderChildren(node.content ?? [], '\n\n')
    const quoted = body
      .split('\n')
      .map((line: string) => (line ? `> ${line}` : '>'))
      .join('\n')
    return `> [!${String(node.attrs?.type ?? 'note').toUpperCase()}]\n${quoted}`
  },
})
