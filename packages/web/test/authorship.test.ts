// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { blocksWithAuthors } from '../app/utils/authorship'
import { renderMarkdown, sanitizeHtml } from '../app/utils/render-markdown'

describe('authorship blocks', () => {
  const content =
    '# Title\n\nFirst paragraph\non two lines.\n\n- one\n- two\n\n## Agent\n\nBy the agent.\n'
  const blame = [
    { start: 0, count: 5, author: 'owner', at: 1 },
    { start: 5, count: 1, author: 'claude', at: 2 },
    { start: 6, count: 1, author: 'owner', at: 1 },
    { start: 7, count: 4, author: 'claude', at: 3 },
  ]

  it('maps blocks to the lines they span, and list items one by one', () => {
    const blocks = blocksWithAuthors(content, blame)
    expect(
      blocks.map((b) => [b.markdown.split('\n')[0], b.startLine, b.lineCount, b.author]),
    ).toEqual([
      ['# Title', 0, 1, 'owner'],
      ['First paragraph', 2, 2, 'owner'],
      ['- one', 5, 1, 'claude'],
      ['- two', 6, 1, 'owner'],
      ['## Agent', 8, 1, 'claude'],
      ['By the agent.', 10, 1, 'claude'],
    ])
  })

  it('gives a block edited by two authors to the latest one', () => {
    const [block] = blocksWithAuthors('a\nb\n', [
      { start: 0, count: 1, author: 'claude', at: 5 },
      { start: 1, count: 1, author: 'owner', at: 9 },
    ])
    expect(block?.author).toBe('owner')
  })
})

describe('rendering', () => {
  it('renders callouts, task lists and wiki links', () => {
    const html = renderMarkdown('> [!WARNING]\n> Careful\n\n- [x] done\n\n[[Target|label]]', 'N.md')
    expect(html).toContain('data-callout="warning"')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('class="wiki-link')
    expect(html).toContain('label')
  })

  it('makes attachment paths absolute', () => {
    expect(renderMarkdown('![a](N.assets/a.png)', 'F/N.md')).toContain(
      'src="/files/F/N.assets/a.png"',
    )
  })

  it('removes scripts, handlers and javascript: links', () => {
    const html = sanitizeHtml(
      '<script>x</script><img src="a.png" onerror="x"><a href="javascript:x">l</a><input type="text">',
    )
    expect(html).not.toMatch(/script|onerror|javascript|type="text"/)
  })
})
