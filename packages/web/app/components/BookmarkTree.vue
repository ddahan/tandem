<script setup lang="ts">
// The sidebar's Bookmarks section, right after the pages: folded until opened (remembered),
// then a tree of folders and bookmarks like the pages' one (drag and drop, a menu on each row,
// F2). A click opens a bookmark or folder as a page (pages/bookmarks/[id].vue) in the preview
// tab, as browsing them with the arrows does; a double click or ↵ opens a bookmark's website
// (a folder's page in a tab of its own). Dragged into a note, a bookmark becomes its card
// (editor/bookmark.ts). Several are selected with ⌘- and ⇧-click (utils/tree-selection.ts).
import type { DropdownMenuItem } from '@nuxt/ui'
import { useLocalStorage } from '@vueuse/core'
import { openWebsite, type BookmarkItem } from '~/composables/useBookmarks'
import { BOOKMARK_DRAG_TYPE } from '~/editor/bookmark'
import { actedOn, clickRow, emptySelection, isSelected, shownIds } from '~/utils/tree-selection'

const bookmarks = useBookmarks()
const actions = useBookmarkActions()
const showError = useApiErrorToast()

const open = useLocalStorage('tandem-bookmarks-open', false)
const expanded = useLocalStorage<string[]>('tandem-bookmarks-expanded', [])

function toggle(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter((x) => x !== id)
    : [...expanded.value, id]
}

function expand(id: string | null) {
  if (id && !expanded.value.includes(id)) expanded.value = [...expanded.value, id]
}

// --- Opening (a click, or browsing with the arrows) -------------------------------------------

const tabs = useTabs()
const route = useRoute()
const currentId = computed(() => (route.name === 'bookmarks-id' ? String(route.params.id) : null))

function rowOf(id: string) {
  return document.querySelector<HTMLElement>(`[data-bookmark-id="${id}"]`)
}

// --- Selecting several ------------------------------------------------------------------------

const selection = ref(emptySelection())

function clearSelection() {
  selection.value = emptySelection()
}

/** A click on a row: ⌘ or ⇧ selects (and opens nothing), a plain click shows it. */
function onRowClick(event: MouseEvent, item: BookmarkItem) {
  const shown = shownIds(bookmarks.items.value, expanded.value)
  const result = clickRow(selection.value, event, item.id, shown, currentId.value)
  selection.value = result.selection
  if (!result.selecting) show(item)
}

/** What an action on `item` acts on: the selection when it's in it, otherwise itself. */
function actedOnFrom(item: BookmarkItem) {
  return actedOn(selection.value, item.id, bookmarks.isWithin)
}

function bookmarksOf(ids: string[]) {
  return ids.flatMap((id) => bookmarks.byId.value.get(id) ?? [])
}

/** Its page, in the preview tab (a folder also unfolds: the tree does it, UTree). */
function show(item: BookmarkItem) {
  void tabs.preview(`/bookmarks/${item.id}`)
}

function activate(item: BookmarkItem) {
  if (item.bookmark.kind === 'folder') void tabs.open(`/bookmarks/${item.id}`)
  else openWebsite(item.bookmark.url)
}

// As in the pages' tree: the row reached with the arrows shows, once the keys pause.
const BROWSE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
let browsing = false
let browseTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(browseTimer))
function onTreeKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selection.value.ids.length) clearSelection()
  browsing = BROWSE_KEYS.has(event.key) && !event.altKey && !event.metaKey && !event.ctrlKey
}
function onTreeFocusin(event: FocusEvent) {
  if (!browsing || renamingId.value) return
  browsing = false
  const target = event.target as HTMLElement
  const row = target.closest('[data-bookmark-id]') ?? target.querySelector('[data-bookmark-id]')
  const id = row?.getAttribute('data-bookmark-id')
  if (!id) return
  clearTimeout(browseTimer)
  browseTimer = setTimeout(() => void tabs.preview(`/bookmarks/${id}`), 150)
}

// --- Renaming --------------------------------------------------------------------------------

const renamingId = ref<string | null>(null)
const renameValue = ref('')

function startRename(item: BookmarkItem) {
  renamingId.value = item.id
  renameValue.value = item.label
}

async function commitRename() {
  const id = renamingId.value
  renamingId.value = null
  const title = renameValue.value.trim()
  if (!id || !title || title === bookmarks.byId.value.get(id)?.title) return
  await bookmarks
    .update(id, { title })
    .catch((error: unknown) => showError(error, 'Could not rename'))
}

// --- Making, moving, deleting ------------------------------------------------------------------

async function newBookmark(parentId: string | null = null) {
  open.value = true
  expand(parentId)
  await actions.create({ parentId })
}

async function newFolder(parentId: string | null = null) {
  open.value = true
  expand(parentId)
  try {
    const folder = await bookmarks.create({ kind: 'folder', title: 'New folder', parentId })
    await nextTick()
    startRename({ id: folder.id, label: folder.title, bookmark: folder })
  } catch (error) {
    showError(error, 'Could not make the folder')
  }
}

async function remove(item: BookmarkItem) {
  const ids = actedOnFrom(item)
  if (ids.length > 1) return removeMany(ids)
  await actions.remove(item.bookmark)
}

async function removeMany(ids: string[]) {
  if (await actions.removeMany(bookmarksOf(ids))) clearSelection()
}

async function moveSibling(item: BookmarkItem, step: -1 | 1) {
  const siblings = bookmarks.childrenOf.value.get(item.bookmark.parentId) ?? []
  const index = siblings.findIndex((b) => b.id === item.id) + step
  if (index < 0 || index >= siblings.length) return
  await bookmarks.move(item.id, item.bookmark.parentId, index).catch(showError)
  await nextTick()
  rowOf(item.id)?.focus()
}

/**
 * Keys on a focused row (the arrows are the tree's own): ↵ opens the website (a folder unfolds),
 * ⌘⌫ (or Delete) deletes once confirmed, F2 renames, ⌥↑/⌥↓ reorder. Listed in shortcuts.ts.
 */
function onRowKeydown(event: KeyboardEvent, item: BookmarkItem) {
  if (renamingId.value) return
  const handle = (action: () => unknown) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    void action()
  }
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  if (event.key === 'Enter' && plain) handle(() => activate(item))
  else if (
    (event.key === 'Backspace' && (event.metaKey || event.ctrlKey)) ||
    event.key === 'Delete'
  )
    handle(() => remove(item))
  else if (event.key === 'F2') handle(() => startRename(item))
  else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown'))
    handle(() => moveSibling(item, event.key === 'ArrowUp' ? -1 : 1))
}

// --- Menus -----------------------------------------------------------------------------------

function menu(item: BookmarkItem): DropdownMenuItem[][] {
  const ids = actedOnFrom(item)
  if (ids.length > 1) return selectionMenu(ids)
  const folder = item.bookmark.kind === 'folder'
  return [
    folder
      ? [
          {
            label: 'New bookmark inside',
            icon: 'i-lucide-bookmark-plus',
            onSelect: () => void newBookmark(item.id),
          },
          {
            label: 'New folder inside',
            icon: 'i-lucide-folder-plus',
            onSelect: () => void newFolder(item.id),
          },
          {
            label: 'Export for Chrome',
            icon: 'i-lucide-download',
            onSelect: () => exportBookmarks(item.id),
          },
        ]
      : [
          {
            label: 'Open website',
            icon: 'i-lucide-external-link',
            kbds: ['enter'],
            onSelect: () => activate(item),
          },
          {
            label: 'Open in a tab',
            icon: 'i-lucide-panel-top',
            onSelect: () => void tabs.open(`/bookmarks/${item.id}`),
          },
        ],
    [
      { label: 'Rename', icon: 'i-lucide-pencil', kbds: ['F2'], onSelect: () => startRename(item) },
      {
        label: 'Move up',
        icon: 'i-lucide-arrow-up',
        kbds: ['alt', 'arrowup'],
        onSelect: () => void moveSibling(item, -1),
      },
      {
        label: 'Move down',
        icon: 'i-lucide-arrow-down',
        kbds: ['alt', 'arrowdown'],
        onSelect: () => void moveSibling(item, 1),
      },
      ...(folder
        ? []
        : [
            {
              label: 'Copy address',
              icon: 'i-lucide-link',
              onSelect: () => void navigator.clipboard.writeText(item.bookmark.url),
            },
          ]),
    ],
    [
      {
        label: 'Delete…',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        kbds: ['meta', 'backspace'],
        onSelect: () => void remove(item),
      },
    ],
  ]
}

/** The menu of a selected row: for all of them. */
function selectionMenu(ids: string[]): DropdownMenuItem[][] {
  const sites = bookmarksOf(ids).filter((bookmark) => bookmark.kind === 'bookmark')
  return [
    [
      ...(sites.length
        ? [
            {
              label: sites.length === 1 ? 'Open its website' : `Open ${sites.length} websites`,
              icon: 'i-lucide-external-link',
              onSelect: () => {
                clearSelection()
                for (const site of sites) openWebsite(site.url)
              },
            },
          ]
        : []),
      { label: 'Move to', icon: 'i-lucide-folder-input', children: moveTargets(ids) },
    ],
    [
      {
        label: `Delete ${ids.length}…`,
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        kbds: ['meta', 'backspace'],
        onSelect: () => void removeMany(ids),
      },
    ],
  ]
}

/** Where a selection can go: the top, or a folder (not one of them, nor inside one). */
function moveTargets(ids: string[]): DropdownMenuItem[] {
  return bookmarks
    .folderOptions()
    .filter((option) => !option.id || !ids.some((id) => bookmarks.isWithin(option.id!, id)))
    .map((option) => ({
      label: option.id
        ? bookmarks
            .foldersOf(option.id)
            .map((folder) => folder.title)
            .concat(option.label)
            .join(' / ')
        : 'Top level',
      icon: option.id ? 'i-lucide-folder' : 'i-lucide-list-tree',
      onSelect: () => {
        clearSelection()
        void bookmarks
          .moveMany(ids, option.id)
          .catch((error: unknown) => showError(error, 'Could not move the bookmarks'))
      },
    }))
}

const addMenu: DropdownMenuItem[] = [
  { label: 'New bookmark', icon: 'i-lucide-bookmark-plus', onSelect: () => void newBookmark() },
  { label: 'New folder', icon: 'i-lucide-folder-plus', onSelect: () => void newFolder() },
]

/** Right-clicking the section (its title, around the tree): what "+" offers, and the export. */
const sectionMenu: DropdownMenuItem[][] = [
  addMenu,
  [
    {
      label: 'Export all for Chrome',
      icon: 'i-lucide-download',
      onSelect: () => exportBookmarks(),
    },
  ],
]

/** Downloads a bookmarks file Chrome imports (all, or a folder): the server writes it. */
function exportBookmarks(folder?: string) {
  const link = document.createElement('a')
  link.href = `/api/bookmarks/export${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`
  link.download = ''
  link.click()
}

// One menu for the whole tree, on a right-click (see NoteTree).
const contextItem = ref<BookmarkItem | null>(null)
const contextItems = computed(() => (contextItem.value ? menu(contextItem.value) : sectionMenu))

function onContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('input')) {
    event.stopPropagation()
    return
  }
  const id = target.closest<HTMLElement>('[data-bookmark-id]')?.dataset.bookmarkId
  contextItem.value = (id && findItem(bookmarks.items.value, id)) || null
}

function findItem(items: BookmarkItem[], id: string): BookmarkItem | undefined {
  for (const item of items) {
    const found = item.id === id ? item : item.children && findItem(item.children, id)
    if (found) return found
  }
}

// --- Drag and drop -----------------------------------------------------------------------------

type DropZone = 'before' | 'inside' | 'after'
/** What is dragged: a row, or the selection it's in. */
const dragged = ref<string[]>([])
const dropTarget = ref<{ id: string; zone: DropZone } | null>(null)

function onDragStart(event: DragEvent, item: BookmarkItem) {
  dragged.value = actedOnFrom(item)
  if (!event.dataTransfer) return
  event.dataTransfer.setData(BOOKMARK_DRAG_TYPE, item.id)
  // Dropped elsewhere (another app, the address bar), it's its address.
  if (item.bookmark.kind === 'bookmark') {
    event.dataTransfer.setData('text/uri-list', item.bookmark.url)
    event.dataTransfer.setData('text/plain', item.bookmark.url)
  }
  event.dataTransfer.effectAllowed = 'copyMove'
}

function zoneOf(event: DragEvent, item: BookmarkItem): DropZone {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = (event.clientY - rect.top) / rect.height
  if (item.bookmark.kind !== 'folder') return ratio < 0.5 ? 'before' : 'after'
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
}

function canDrop(targetId: string): boolean {
  return dragged.value.length > 0 && !dragged.value.some((id) => bookmarks.isWithin(targetId, id))
}

function onDragOver(event: DragEvent, item: BookmarkItem) {
  if (!canDrop(item.id)) return
  event.preventDefault()
  dropTarget.value = { id: item.id, zone: zoneOf(event, item) }
}

async function onDrop(event: DragEvent, item: BookmarkItem) {
  event.preventDefault()
  const ids = dragged.value
  const zone = zoneOf(event, item)
  const allowed = canDrop(item.id)
  reset()
  if (!ids.length || !allowed) return
  if (ids.length > 1) clearSelection()
  const moveTo = (parentId: string | null, index?: number) =>
    ids.length > 1
      ? bookmarks.moveMany(ids, parentId, index)
      : bookmarks.move(ids[0]!, parentId, index)
  try {
    if (zone === 'inside') {
      expand(item.id)
      await moveTo(item.id)
      return
    }
    const parentId = item.bookmark.parentId
    const siblings = (bookmarks.childrenOf.value.get(parentId) ?? []).filter(
      (b) => !ids.includes(b.id),
    )
    const index = siblings.findIndex((b) => b.id === item.id) + (zone === 'after' ? 1 : 0)
    await moveTo(parentId, index)
  } catch (error) {
    showError(error, 'Could not move the bookmark')
  }
}

function onDropOnRoot(event: DragEvent) {
  const ids = dragged.value
  if (!ids.length) return
  event.preventDefault()
  reset()
  if (ids.length > 1) clearSelection()
  void (ids.length > 1 ? bookmarks.moveMany(ids, null) : bookmarks.move(ids[0]!, null)).catch(
    showError,
  )
}

function reset() {
  dragged.value = []
  dropTarget.value = null
}

function rowClass(item: BookmarkItem) {
  const target = dropTarget.value?.id === item.id ? dropTarget.value.zone : null
  return [
    isSelected(selection.value, item.id)
      ? 'bg-primary/20 text-highlighted'
      : currentId.value === item.id
        ? 'bg-elevated text-highlighted font-medium'
        : 'text-default hover:bg-elevated/60',
    dragged.value.includes(item.id) && 'opacity-50',
    target === 'inside' && 'ring-2 ring-primary ring-inset',
    target === 'before' && 'shadow-[inset_0_2px_0_0_var(--ui-primary)]',
    target === 'after' && 'shadow-[inset_0_-2px_0_0_var(--ui-primary)]',
  ]
}
</script>

<template>
  <UContextMenu :items="contextItems" :content="keepMovedFocus">
    <div
      class="flex shrink-0 grow flex-col"
      data-testid="bookmarks"
      @contextmenu.capture="onContextMenu"
    >
      <div class="flex items-center justify-between ps-1 pe-2.5 pb-1">
        <button
          type="button"
          class="flex items-center gap-1 rounded px-1 text-xs font-medium text-muted hover:text-default"
          :aria-expanded="open"
          data-testid="bookmarks-toggle"
          @click="open = !open"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5 transition-transform"
            :class="open && 'rotate-90'"
          />
          Bookmarks
        </button>
        <UDropdownMenu :items="addMenu" :content="{ align: 'end', ...keepMovedFocus }">
          <UButton
            icon="i-lucide-plus"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="New bookmark or folder"
          />
        </UDropdownMenu>
      </div>

      <div v-if="open" class="grow px-1" @dragover.prevent @drop="onDropOnRoot" @dragend="reset">
        <div class="pb-2" @keydown.capture="onTreeKeydown" @focusin="onTreeFocusin">
          <UTree
            v-model:expanded="expanded"
            :items="bookmarks.items.value"
            :get-key="(item: BookmarkItem) => item.id"
            :on-select="(event: Event) => event.preventDefault()"
            :ui="{ listWithChildren: 'ms-3 border-s border-default ps-1' }"
            size="sm"
          >
            <template #item-wrapper="{ item, expanded: isExpanded }">
              <div
                class="tree-row group relative flex h-7 cursor-pointer items-center gap-1 rounded-md ps-1 pe-1 text-sm transition-colors select-none"
                :class="rowClass(item)"
                :data-current="currentId === item.id || undefined"
                draggable="true"
                :data-bookmark-id="item.id"
                :data-testid="`bookmark-${item.label}`"
                :title="item.bookmark.kind === 'bookmark' ? item.bookmark.url : undefined"
                @keydown.capture="onRowKeydown($event, item)"
                :data-selected="isSelected(selection, item.id) || undefined"
                @click="onRowClick($event, item)"
                @dblclick="activate(item)"
                @dragstart="onDragStart($event, item)"
                @dragover.stop="onDragOver($event, item)"
                @dragleave="dropTarget = null"
                @drop.stop="onDrop($event, item)"
                @dragend="reset"
              >
                <button
                  v-if="item.children?.length"
                  type="button"
                  class="grid size-5 shrink-0 place-items-center rounded text-dimmed hover:text-default"
                  :aria-label="isExpanded ? 'Collapse' : 'Expand'"
                  @click.stop="toggle(item.id)"
                >
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3.5 transition-transform"
                    :class="isExpanded && 'rotate-90'"
                  />
                </button>
                <span v-else class="size-5 shrink-0" />
                <BookmarkIcon :bookmark="item.bookmark" />

                <UInput
                  v-if="renamingId === item.id"
                  v-model="renameValue"
                  size="xs"
                  autofocus
                  aria-label="New name"
                  class="min-w-0 flex-1"
                  @click.stop
                  @keydown.enter.prevent="commitRename"
                  @keydown.esc.prevent="renamingId = null"
                  @blur="commitRename"
                />
                <span v-else class="min-w-0 flex-1 truncate">{{ item.label }}</span>

                <!-- Over the end of the name, on hover (or focus), as in the pages tree. -->
                <div
                  v-if="renamingId !== item.id"
                  class="tree-row-actions absolute inset-y-0 end-0 flex items-center rounded-e-md ps-6 pe-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                  @click.stop
                  @dblclick.stop
                >
                  <UDropdownMenu
                    :items="menu(item)"
                    :content="{ align: 'start', ...keepMovedFocus }"
                  >
                    <UButton
                      icon="i-lucide-ellipsis"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      aria-label="Actions"
                    />
                  </UDropdownMenu>
                </div>
              </div>
            </template>
          </UTree>

          <div
            v-if="bookmarks.loaded.value && !bookmarks.items.value.length"
            class="flex flex-col items-start gap-1 px-2 py-1 text-xs text-muted"
          >
            <p>No bookmarks yet. Add one here, or from Chrome with Tandem’s extension.</p>
            <div class="flex gap-1">
              <UButton
                label="New bookmark"
                icon="i-lucide-bookmark-plus"
                size="xs"
                color="neutral"
                variant="soft"
                @click="newBookmark()"
              />
              <UButton
                label="The extension"
                icon="i-lucide-puzzle"
                size="xs"
                color="neutral"
                variant="ghost"
                to="/docs/extension"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </UContextMenu>
</template>
