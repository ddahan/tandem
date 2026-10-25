import { describe, expect, it } from 'vitest'
import { cellMove, type CellField } from '../app/utils/database-keys'

const text = (start: number, length: number, multiline = false, end = start): CellField => ({
  kind: 'text',
  start,
  end,
  length,
  multiline,
})

describe('arrow keys between database cells', () => {
  it('moves up and down from a one-line field wherever its caret is', () => {
    expect(cellMove('ArrowUp', text(2, 5))).toBe('up')
    expect(cellMove('ArrowDown', text(2, 5))).toBe('down')
  })

  it('moves sideways only from the start or end of a text', () => {
    expect(cellMove('ArrowLeft', text(0, 5))).toBe('left')
    expect(cellMove('ArrowLeft', text(2, 5))).toBeNull()
    expect(cellMove('ArrowRight', text(5, 5))).toBe('right')
    expect(cellMove('ArrowRight', text(2, 5))).toBeNull()
    expect(cellMove('ArrowRight', text(0, 0))).toBe('right')
  })

  it('leaves a text of several lines only from its very start (up) or end (down)', () => {
    expect(cellMove('ArrowUp', text(3, 10, true))).toBeNull()
    expect(cellMove('ArrowUp', text(0, 10, true))).toBe('up')
    expect(cellMove('ArrowDown', text(3, 10, true))).toBeNull()
    expect(cellMove('ArrowDown', text(10, 10, true))).toBe('down')
  })

  it('leaves a selection to its field', () => {
    expect(cellMove('ArrowUp', text(0, 5, false, 5))).toBeNull()
    expect(cellMove('ArrowRight', text(0, 5, false, 5))).toBeNull()
  })

  it("keeps ↑ / ↓ for a date's parts, and leaves it sideways from its first or last", () => {
    const day: CellField = { kind: 'segment', first: true, last: false }
    const year: CellField = { kind: 'segment', first: false, last: true }
    expect(cellMove('ArrowUp', day)).toBeNull()
    expect(cellMove('ArrowDown', year)).toBeNull()
    expect(cellMove('ArrowLeft', day)).toBe('left')
    expect(cellMove('ArrowRight', day)).toBeNull()
    expect(cellMove('ArrowRight', year)).toBe('right')
  })

  it('moves every way from other controls, and ignores other keys', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(cellMove(key, { kind: 'control' })).not.toBeNull()
    }
    expect(cellMove('Enter', { kind: 'control' })).toBeNull()
  })
})
