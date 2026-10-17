// `[[Target]]`, `[[Target#Heading]]`, `[[Target|label]]`: links between notes, as an inline
// node (an atom: edited as a whole). Without it, the Markdown serializer would escape the
// brackets of plain text (`\[\[Target\]\]`).
import { InputRule, Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface WikiLinkAttributes {
  target: string
  heading: string | null
  label: string | null
}

export interface WikiLinkOptions {
  /** Called when a link is clicked. */
  onOpen: (attributes: WikiLinkAttributes) => void
}

const PATTERN = /^\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]/

export function wikiLinkMarkdown({ target, heading, label }: WikiLinkAttributes): string {
  return `[[${target}${heading ? `#${heading}` : ''}${label ? `|${label}` : ''}]]`
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onOpen: () => {} }
  },

  addAttributes() {
    // Rendered as data-* attributes by renderHTML only: as plain attributes, `target` would
    // become the link's HTML target (a named window) and reload the app on click.
    return {
      target: { default: '', renderHTML: () => ({}) },
      heading: { default: null, renderHTML: () => ({}) },
      label: { default: null, renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wiki-link]',
        getAttrs: (element) => ({
          target: element.getAttribute('data-target') ?? '',
          heading: element.getAttribute('data-heading'),
          label: element.getAttribute('data-label'),
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { target, heading, label } = node.attrs as WikiLinkAttributes
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-wiki-link': '',
        'data-target': target,
        'data-heading': heading,
        'data-label': label,
        // No href: navigation is done by the app's router (onOpen), never by the browser.
        role: 'link',
        class: 'wiki-link',
      }),
      label || (heading ? `${target} › ${heading}` : target),
    ]
  },

  renderText({ node }) {
    return wikiLinkMarkdown(node.attrs as WikiLinkAttributes)
  },

  markdownTokenizer: {
    name: 'wikiLink',
    level: 'inline',
    start: (src: string) => src.indexOf('[['),
    tokenize(src: string) {
      const match = PATTERN.exec(src)
      if (!match) return undefined
      return {
        type: 'wikiLink',
        raw: match[0],
        target: match[1]!.trim(),
        heading: match[2]?.trim() || null,
        label: match[3]?.trim() || null,
      }
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('wikiLink', {
      target: token.target as string,
      heading: token.heading as string | null,
      label: token.label as string | null,
    })
  },

  renderMarkdown(node) {
    return wikiLinkMarkdown(node.attrs as WikiLinkAttributes)
  },

  addInputRules() {
    // Typing `[[Target]]` turns it into a link.
    return [
      new InputRule({
        find: /\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]$/,
        handler: ({ state, range, match }) => {
          const node = this.type.create({
            target: match[1]!.trim(),
            heading: match[2]?.trim() || null,
            label: match[3]?.trim() || null,
          })
          state.tr.replaceWith(range.from, range.to, node)
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    const onOpen = this.options.onOpen
    return [
      new Plugin({
        key: new PluginKey('wikiLinkClick'),
        props: {
          handleDOMEvents: {
            // Belt and braces: the browser must never follow a wiki link itself.
            click: (_view, event) => {
              if ((event.target as Element | null)?.closest?.('[data-wiki-link]'))
                event.preventDefault()
              return false
            },
          },
          handleClickOn(_view, _pos, node, _nodePos, event) {
            if (node.type.name !== 'wikiLink') return false
            event.preventDefault()
            onOpen(node.attrs as WikiLinkAttributes)
            return true
          },
        },
      }),
    ]
  },
})
