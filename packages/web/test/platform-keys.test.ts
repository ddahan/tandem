// Shortcuts in text, for this computer: macOS's symbols on a Mac, names elsewhere.
import { describe, expect, it } from 'vitest'
import { keysText } from '../app/utils/platform-keys'

describe('shortcuts in text', () => {
  it('keeps macOS symbols on a Mac', () => {
    expect(keysText('Press ⌥⌘W', true)).toBe('Press ⌥⌘W')
  })

  it('writes them out elsewhere, in the usual order', () => {
    expect(keysText('Press ⌥⌘W to close', false)).toBe('Press Ctrl+Alt+W to close')
    expect(keysText('⌘⇧F, then ↵', false)).toBe('Ctrl+Shift+F, then ↵')
    expect(keysText('⌘⇧↵ inserts above', false)).toBe('Ctrl+Shift+Enter inserts above')
    expect(keysText('⌘-click opens it', false)).toBe('Ctrl-click opens it')
    expect(keysText('⌃1…⌃9', false)).toBe('Ctrl+1…Ctrl+9')
    expect(keysText('(⌘\\)', false)).toBe('(Ctrl+\\)')
  })
})
