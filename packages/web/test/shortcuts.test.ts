// The Shortcuts page's keys: in a browser tab, not those the browser keeps (utils/shortcuts.ts).
import { describe, expect, it } from 'vitest'
import { keysHere, SHORTCUT_GROUPS } from '../app/utils/shortcuts'

const find = (label: string) =>
  SHORTCUT_GROUPS.flatMap((group) => group.shortcuts).find((s) => s.label === label)!

describe('keysHere', () => {
  it('shows the installed app’s keys only in its window, first', () => {
    const newPage = find('New page')
    expect(keysHere(newPage, true, true)).toEqual([
      ['meta', 'n'],
      ['meta', 'alt', 'n'],
    ])
    expect(keysHere(newPage, false, true)).toEqual([['meta', 'alt', 'n']])
    expect(keysHere(find('Close the tab'), false, true)).toEqual([])
  })

  it('shows keys that are the same outside macOS once', () => {
    const week = find('A week later or earlier')
    expect(keysHere(week, true, true)).toHaveLength(4)
    expect(keysHere(week, true, false)).toEqual([
      ['meta', 'alt', 'arrowdown'],
      ['meta', 'alt', 'arrowup'],
    ])
  })
})
