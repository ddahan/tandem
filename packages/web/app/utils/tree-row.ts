// What the pages' tree (NoteTree) gives each of its rows (NoteTreeRow): its state, and what a
// row does. A row reads from it only what concerns it, so a change (another page opened, a row
// selected, a drag passing over) redraws the rows it changes, not the whole tree.
import type { DropdownMenuItem } from '@nuxt/ui'
import type { InjectionKey, Ref } from 'vue'
import type { TreeItem } from '~/composables/useTree'
import type { TreeSelection } from '~/utils/tree-selection'

export type DropZone = 'before' | 'inside' | 'after'

export interface TreeRowContext {
  /** The page open, if the route shows one. */
  currentId: Ref<string | null>
  selection: Ref<TreeSelection>
  /** The rows being dragged. */
  dragged: Ref<string[]>
  dropTarget: Ref<{ id: string | null; zone: DropZone } | null>
  renamingId: Ref<string | null>
  renameValue: Ref<string>
  menu(item: TreeItem): DropdownMenuItem[][]
  toggle(id: string): void
  click(event: MouseEvent, item: TreeItem): void
  openForGood(item: TreeItem): void
  keydown(event: KeyboardEvent, item: TreeItem): void
  createInside(item: TreeItem): void
  commitRename(): void
  dragStart(event: DragEvent, item: TreeItem): void
  dragOver(event: DragEvent, item: TreeItem): void
  drop(event: DragEvent, item: TreeItem): void
  dragEnd(): void
}

export const TREE_ROW: InjectionKey<TreeRowContext> = Symbol('tree-row')
