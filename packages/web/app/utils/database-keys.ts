// Arrow keys between a database's cells, as in a spreadsheet. Cells are always fields, so an
// arrow first does what it does in its field (the caret in a text, a date's parts) and only
// moves to the next cell once the field has nothing left to do in that direction.

export type CellDirection = 'up' | 'down' | 'left' | 'right'

/** The field an arrow is pressed in, as far as moving out of it is concerned. */
export type CellField =
  /** A text or a number: where its caret is, and whether it shows more than one line. */
  | { kind: 'text'; start: number; end: number; length: number; multiline: boolean }
  /** A part of a date (day, month, year): ↑ / ↓ change it, ← / → go to the next part. */
  | { kind: 'segment'; first: boolean; last: boolean }
  /** Anything else (checkbox, choice, a date's calendar button): arrows only move. */
  | { kind: 'control' }

const DIRECTIONS: Record<string, CellDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/** The direction to move to another cell, or null: the key is the field's. */
export function cellMove(key: string, field: CellField): CellDirection | null {
  const direction = DIRECTIONS[key]
  if (!direction) return null
  if (field.kind === 'control') return direction
  if (field.kind === 'segment') {
    if (direction === 'left') return field.first ? direction : null
    if (direction === 'right') return field.last ? direction : null
    return null
  }
  // A selection is the field's (an arrow collapses it).
  if (field.start !== field.end) return null
  const atStart = field.start === 0
  const atEnd = field.end === field.length
  if (direction === 'left') return atStart ? direction : null
  if (direction === 'right') return atEnd ? direction : null
  // One line: nowhere to go up or down in it. Several: only from their very start or end.
  if (!field.multiline) return direction
  return (direction === 'up' ? atStart : atEnd) ? direction : null
}
