// What the side panel's tabs list for a page and its sub-pages (SideSubtree), whatever their
// kind, and the flat display's sorting: by page (the tree's order), by name, or by what the
// kind has (size and type for files, site for bookmarks, rows for databases).
import type { SubtreePage } from '@tandem/shared'

export interface SubtreeItem {
  key: string
  page: SubtreePage
  /** Tree order: the page's place, then the item's in it. */
  order: number
  label: string
  detail: string
  icon?: string
  bookmark?: { icon: string | null; emoji: string | null } | null
  fileSvg?: string
  size?: number
  type?: string
  site?: string
  rows?: number
  missing?: boolean
  open: () => void
  /** A double click (a bookmark's website). */
  activate?: () => void
}

export type SubtreeSort = 'page' | 'name' | 'size' | 'type' | 'site' | 'rows'

const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare

/** Sorted for the flat display: the largest first for sizes and rows, ties in tree order. */
export function sortSubtreeItems<T extends Omit<SubtreeItem, 'page' | 'open'>>(
  items: T[],
  sort: SubtreeSort,
): T[] {
  return items.toSorted((a, b) => {
    switch (sort) {
      case 'name':
        return compare(a.label, b.label) || a.order - b.order
      case 'size':
        return (b.size ?? 0) - (a.size ?? 0) || a.order - b.order
      case 'rows':
        return (b.rows ?? 0) - (a.rows ?? 0) || a.order - b.order
      case 'type':
        return compare(a.type ?? '', b.type ?? '') || compare(a.label, b.label)
      case 'site':
        return compare(a.site ?? '', b.site ?? '') || compare(a.label, b.label)
      default:
        return a.order - b.order
    }
  })
}
