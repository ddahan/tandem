// @vitest-environment happy-dom
// What the editor would lose of a note's Markdown: real trips through the editor.
import { describe, expect, it } from 'vitest'
import { markdownLosses } from '../app/utils/markdown-loss'

const losses = (markdown: string) =>
  markdownLosses(markdown, 'Note.md').map(({ line, what }) => `${line}: ${what}`)

describe('Markdown the editor would lose', () => {
  it.each([
    '# Title\n\nSome **bold**, _italic_, __strong__ and `code <span>`.',
    '* star\n* list\n\n1. one\n2. two\n\n- [ ] task\n  1. nested',
    'Setext\n======\n\nTom &amp; Jerry &lt;3, \\(x\\)',
    'Line one<br>line two\n\n<img src="a.png" width="200">',
    '<details>\n<summary>More</summary>\n\nInside\n\n</details>',
    '```html\n<div><!-- kept in code --></div>\n```',
    '```ts\nunclosed fence',
    '[ref link][r] and <https://example.com>\n\n[r]: https://example.com/page',
    '| a | b |\n|---|---|\n| **1** | 2 |\n\n> [!NOTE]\n> A callout',
    'See [[Projects/Roadmap|the roadmap]] :smile:',
    '1. one\n1. two\n1. three\n\n5) five\n5) six',
  ])('finds nothing in what the editor keeps, rewritten or not: %s', (markdown) => {
    expect(losses(markdown)).toEqual([])
  })

  it('finds comments and raw HTML, by line', () => {
    expect(
      losses(
        'Intro\n\n<!-- for agents: keep this -->\n\nA <span style="color:red">red</span> word',
      ),
    ).toEqual(['3: an HTML comment', '5: HTML <span>'])
    expect(losses('Press <kbd>Ctrl</kbd>, x<sup>2</sup>')).toEqual(['1: HTML <kbd>, <sup>'])
    expect(losses('<div>\nblock\n</div>')).toEqual(['1: HTML <div>'])
  })
})
