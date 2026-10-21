// @vitest-environment happy-dom
// Markdown round-trips through the editor: what an agent writes must come back unchanged (or
// only normalized) after the owner edits a note in the app.
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions, starterKitOptions } from '../app/editor/extensions'
import { DOCS_BLOCK_GROUPS } from '../app/utils/docs-blocks'
import { SCRATCHPAD_MARKDOWN, welcomeMarkdown } from '../../server/src/welcome.ts'
import {
  fromEditorMarkdown,
  normalizeMarkdown,
  toEditorMarkdown,
} from '../app/utils/markdown-paths'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function createEditor(markdown: string) {
  editor = new Editor({
    extensions: [
      StarterKit.configure(starterKitOptions),
      Markdown.configure({ markedOptions: { gfm: true } }),
      ...createExtensions(),
    ],
    content: markdown,
    contentType: 'markdown',
  })
  return editor
}

function roundTrip(markdown: string): string {
  return createEditor(markdown).getMarkdown().trim()
}

describe('Markdown round-trip', () => {
  // The welcome note (server/src/welcome.ts): a first edit in it changes nothing else.
  it.each([
    ['welcome note', welcomeMarkdown(3864, 'k3Jd9xQe2TmA')],
    ['scratchpad', SCRATCHPAD_MARKDOWN],
  ])('the %s', (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown.trim())
  })

  // Docs › Blocks shows this Markdown as what notes hold: the editor must write it back as is.
  it.each(DOCS_BLOCK_GROUPS.flatMap((group) => group.blocks.map((b) => [b.title, b.markdown])))(
    'the Docs example of %s',
    (_title, markdown) => {
      expect(roundTrip(markdown)).toBe(markdown)
    },
  )

  it.each([
    ['headings and paragraphs', '# Title\n\nSome **bold**, *italic*, ~~strike~~ and `code`.'],
    ['lists', '- one\n- two\n  - nested\n\n1. first\n2. second'],
    ['task lists', '- [ ] todo\n- [x] done'],
    ['links', 'A [link](https://example.com) here.'],
    ['code blocks', '```ts\nconst a = 1\n```'],
    ['quotes', '> quoted'],
    ['horizontal rules', 'a\n\n---\n\nb'],
    ['emojis', 'Done 🎉 ✅'],
  ])('keeps %s', (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('normalizes formatting only (authorship ignores these differences)', () => {
    expect(roundTrip('_italic_ and * bullet')).toBe('*italic* and \\* bullet')
  })

  it('keeps GFM tables', () => {
    const table = '| Name | Value |\n| --- | --- |\n| a | 1 |\n| b | 2 |'
    const result = roundTrip(table)
    expect(result).toContain('| Name')
    expect(result).toMatch(/\|\s*a\s*\|\s*1\s*\|/)
    expect(roundTrip(result)).toBe(result)
    expect(editor!.getJSON().content?.[0]?.type).toBe('table')
  })

  it('keeps wiki links as nodes, not escaped text', () => {
    const markdown = 'See [[Projects/Roadmap#Goals|the roadmap]] and [[Ideas]].'
    expect(roundTrip(markdown)).toBe(markdown)
    const paragraph = editor!.getJSON().content?.[0]
    expect(paragraph?.content?.filter((n) => n.type === 'wikiLink')).toHaveLength(2)
  })

  it('renders wiki links without HTML target nor href (the router navigates)', () => {
    createEditor('[[Projects/Roadmap|the roadmap]]')
    const html = editor!.getHTML()
    expect(html).toContain('data-target="Projects/Roadmap"')
    expect(html).not.toMatch(/\s(target|href)=/)
  })

  it('keeps callouts', () => {
    const markdown = '> [!WARNING]\n> Careful with **this**.\n>\n> Second paragraph.'
    expect(roundTrip(markdown)).toBe(markdown)
    expect(editor!.getJSON().content?.[0]).toMatchObject({
      type: 'callout',
      attrs: { type: 'warning' },
    })
  })

  it('keeps databases as their block, apart from code blocks', () => {
    const markdown =
      'Books:\n\n```database\nid: Kx3fq9P2mZ0a\n```\n\n```yaml\nid: not-a-database\n```'
    expect(roundTrip(markdown)).toBe(markdown)
    expect(editor!.getJSON().content?.map((node) => node.type)).toEqual([
      'paragraph',
      'database',
      'codeBlock',
    ])
    expect(editor!.getJSON().content?.[1]?.attrs).toEqual({ id: 'Kx3fq9P2mZ0a' })
  })

  it('keeps plain quotes apart from callouts', () => {
    expect(roundTrip('> just a quote')).toBe('> just a quote')
    expect(editor!.getJSON().content?.[0]?.type).toBe('blockquote')
  })

  it('keeps collapsible sections, with Markdown inside', () => {
    const markdown = '<details>\n<summary>More **info**</summary>\n\n- a\n- b\n\n</details>'
    expect(roundTrip(markdown)).toBe(markdown)
    expect(editor!.getJSON().content?.[0]?.type).toBe('details')
  })

  it('keeps nested collapsible sections', () => {
    const markdown =
      '<details>\n<summary>Outer</summary>\n\n<details>\n<summary>Inner</summary>\n\nx\n\n</details>\n\n</details>'
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('keeps images, and resized images as HTML', () => {
    expect(roundTrip('![alt](Note.assets/a.png)')).toBe('![alt](Note.assets/a.png)')
    const resized = '<img src="Note.assets/a.png" alt="alt" width="320">'
    expect(roundTrip(resized)).toBe(resized)
  })
})

const taskItem = (text: string) => ({
  type: 'taskItem',
  attrs: { checked: false },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

describe('adjacent lists', () => {
  it('are merged into one list (no loose Markdown list)', () => {
    const lists = createEditor('')
    lists.commands.setContent({
      type: 'doc',
      content: [
        { type: 'taskList', content: [taskItem('Hey')] },
        { type: 'taskList', content: [taskItem('TODO')] },
        { type: 'paragraph', content: [{ type: 'text', text: 'End' }] },
      ],
    })
    expect(lists.getJSON().content?.map((node) => node.type)).toEqual(['taskList', 'paragraph'])
    expect(lists.getMarkdown().trim()).toBe('- [ ] Hey\n- [ ] TODO\n\nEnd')
  })

  it('leave lists of different kinds apart', () => {
    const lists = createEditor('- a\n\n1. b')
    lists.commands.insertContentAt(lists.state.doc.content.size, 'x')
    expect(
      lists
        .getJSON()
        .content?.map((node) => node.type)
        .slice(0, 2),
    ).toEqual(['bulletList', 'orderedList'])
  })
})

describe('attachment paths', () => {
  it('makes relative paths absolute for the editor, and back', () => {
    const markdown =
      '![a](My%20note.assets/a.png) [f](My%20note.assets/f.pdf) <img src="My%20note.assets/b.png" width="10"> [w](https://x.y) [h](#top)'
    const editorMarkdown = toEditorMarkdown(markdown, 'Projects/My note.md')
    expect(editorMarkdown).toContain('](/files/Projects/My%20note.assets/a.png)')
    expect(editorMarkdown).toContain('src="/files/Projects/My%20note.assets/b.png"')
    expect(editorMarkdown).toContain('](https://x.y)')
    expect(fromEditorMarkdown(editorMarkdown, 'Projects/My note.md')).toBe(markdown)
  })

  it('handles notes at the root', () => {
    expect(toEditorMarkdown('![a](N.assets/a.png)', 'N.md')).toBe('![a](/files/N.assets/a.png)')
  })
})

describe('normalizing', () => {
  it('removes extra blank lines outside code, and ends with one newline', () => {
    expect(normalizeMarkdown('\n\nA\n  \n\n\nB\n\n```\nx\n\n\n\ny\n```\n\n\n')).toBe(
      'A\n\nB\n\n```\nx\n\n\n\ny\n```\n',
    )
    expect(normalizeMarkdown('\n\n')).toBe('')
    // Two trailing spaces are a hard line break.
    expect(normalizeMarkdown('a  \nb')).toBe('a  \nb\n')
  })
})

describe('file icons', () => {
  it('picks the icon of the file type, or a generic one', async () => {
    const { fileIconName, fileIconSvg, fileIconCssUrl } = await import('../app/utils/file-icons')
    expect(fileIconName('report.PDF')).toBe('file-type-pdf2')
    expect(fileIconName('/files/My%20note.assets/data.csv?v=2')).toBe('file-type-csv')
    expect(fileIconName('budget.xlsx')).toBe('file-type-excel')
    expect(fileIconName('archive.tar.gz')).toBe('file-type-zip')
    expect(fileIconName('mystery.qwerty')).toBe('default-file')
    expect(fileIconName('README')).toBe('default-file')
    expect(fileIconSvg('a.pdf')).toMatch(/^<svg/)
    expect(fileIconCssUrl('a.pdf')).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/)
  })

  it('shows chips with the icon of their file type, once per link', () => {
    const chips = createEditor(
      '[report.pdf](N.assets/report.pdf) and [**data**.csv](N.assets/data.csv)',
    )
    const dom = chips.view.dom
    // The link itself is the chip: one per link, even with part of its text in bold.
    const links = [...dom.querySelectorAll<HTMLElement>('a.file-chip')]
    expect(links.map((chip) => chip.textContent)).toEqual(['report.pdf', 'data.csv'])
    expect(
      links.every((chip) => chip.style.getPropertyValue('--file-icon').startsWith('url(')),
    ).toBe(true)
    expect(chips.getMarkdown().trim()).toBe(
      '[report.pdf](N.assets/report.pdf) and [**data**.csv](N.assets/data.csv)',
    )
  })
})
