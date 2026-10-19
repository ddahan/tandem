// Database filters: the conditions each column type offers, and the one a new filter starts
// with (DatabaseFilters, and a column's menu).
import type { ColumnType, DatabaseColumn, DatabaseFilter, FilterOperator } from '@tandem/shared'

export const FILTER_CONDITIONS: Record<ColumnType, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'is', label: 'is' },
    { value: 'is-not', label: 'is not' },
    { value: 'empty', label: 'is empty' },
    { value: 'not-empty', label: 'is not empty' },
  ],
  number: [
    { value: 'is', label: '=' },
    { value: 'is-not', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'lt', label: '<' },
    { value: 'empty', label: 'is empty' },
    { value: 'not-empty', label: 'is not empty' },
  ],
  date: [
    { value: 'is', label: 'is' },
    { value: 'lt', label: 'is before' },
    { value: 'gt', label: 'is after' },
    { value: 'empty', label: 'is empty' },
    { value: 'not-empty', label: 'is not empty' },
  ],
  checkbox: [{ value: 'is', label: 'is' }],
  select: [
    { value: 'is', label: 'is' },
    { value: 'is-not', label: 'is not' },
    { value: 'empty', label: 'is empty' },
    { value: 'not-empty', label: 'is not empty' },
  ],
}

/** A new condition on `column`: its type's first one, without a value (checkboxes: checked). */
export function defaultFilter(column: DatabaseColumn): DatabaseFilter {
  return column.type === 'checkbox'
    ? { column: column.id, operator: 'is', value: true }
    : { column: column.id, operator: FILTER_CONDITIONS[column.type][0]!.value, value: null }
}
