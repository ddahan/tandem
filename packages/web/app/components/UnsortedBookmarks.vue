<script setup lang="ts">
// The sidebar's Unsorted section, right after the pages: the bookmarks the inbox note shows
// (saved from Chrome, imported, or made with its "+"), still to sort into notes. A click edits a
// bookmark in a popover next to its row (useBookmarkEditor); a double click opens its website. Dragged into a note (or onto
// a page in the tree), its card goes there and leaves the inbox note. Its title opens the inbox
// note itself; a right click on the section also exports all bookmarks for Chrome.
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Bookmark } from '@tandem/shared'
import { useLocalStorage } from '@vueuse/core'
import { openWebsite } from '~/composables/useBookmarks'
import { BOOKMARK_DRAG_TYPE, BOOKMARK_FROM_TYPE } from '~/editor/bookmark'
import { keepMovedFocus } from '~/utils/menu-focus'

const bookmarks = useBookmarks()
const actions = useBookmarkActions()
const tabs = useTabs()
const editor = useBookmarkEditor()

const open = useLocalStorage('tandem-unsorted-open', true)
const list = computed(() => bookmarks.unsorted.value.bookmarks)
const inboxId = computed(() => bookmarks.unsorted.value.noteId)
// The one being edited, next to its row.
const currentId = computed(() => editor.editing.value?.id ?? null)

function edit(bookmark: Bookmark, event: Event) {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-unsorted-id]')
  if (row) editor.edit(bookmark.id, row)
}

function openInbox() {
  if (inboxId.value) void tabs.open(`/notes/${inboxId.value}`)
}

/** Downloads a bookmarks file Chrome imports, the pages as its folders: the server writes it. */
function exportBookmarks() {
  const link = document.createElement('a')
  link.href = '/api/bookmarks/export'
  link.download = ''
  link.click()
}

function menu(bookmark: Bookmark): DropdownMenuItem[][] {
  return [
    [
      {
        label: 'Open website',
        icon: 'i-lucide-external-link',
        kbds: ['enter'],
        onSelect: () => openWebsite(bookmark.url),
      },
      {
        label: 'Edit',
        icon: 'i-lucide-pencil',
        onSelect: () => {
          // Next to its row (the menu may be the section's right-click one).
          const anchor = document.querySelector<HTMLElement>(
            `[data-unsorted-id="${CSS.escape(bookmark.id)}"]`,
          )
          if (anchor) editor.edit(bookmark.id, anchor)
        },
      },
      {
        label: 'Copy address',
        icon: 'i-lucide-link',
        onSelect: () => void navigator.clipboard.writeText(bookmark.url),
      },
    ],
    [
      {
        label: 'Delete',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        kbds: ['meta', 'backspace'],
        onSelect: () => void actions.remove(bookmark),
      },
    ],
  ]
}

const sectionMenu = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: 'New bookmark',
      icon: 'i-lucide-bookmark-plus',
      onSelect: () => void actions.create({ inbox: true }),
    },
    ...(inboxId.value
      ? [{ label: 'Open the inbox note', icon: 'i-lucide-inbox', onSelect: openInbox }]
      : []),
  ],
  [{ label: 'Export all for Chrome', icon: 'i-lucide-download', onSelect: exportBookmarks }],
])

// One menu for the whole section, on a right-click: a row's, or the section's.
const contextBookmark = ref<Bookmark | null>(null)
const contextItems = computed(() =>
  contextBookmark.value ? menu(contextBookmark.value) : sectionMenu.value,
)

function onContextMenu(event: MouseEvent) {
  const id = (event.target as HTMLElement).closest<HTMLElement>('[data-unsorted-id]')?.dataset
    .unsortedId
  contextBookmark.value = list.value.find((bookmark) => bookmark.id === id) ?? null
}

const dragged = ref<string | null>(null)

function onDragStart(event: DragEvent, bookmark: Bookmark) {
  if (!event.dataTransfer) return
  dragged.value = bookmark.id
  event.dataTransfer.setData(BOOKMARK_DRAG_TYPE, bookmark.id)
  if (inboxId.value) event.dataTransfer.setData(BOOKMARK_FROM_TYPE, inboxId.value)
  // Out of Tandem (another app, the browser's address bar), its address.
  event.dataTransfer.setData('text/uri-list', bookmark.url)
  event.dataTransfer.setData('text/plain', bookmark.url)
  event.dataTransfer.effectAllowed = 'copyMove'
}

/** ↵ opens its website; ⌘⌫ (or Delete) deletes it, once confirmed. */
function onRowKeydown(event: KeyboardEvent, bookmark: Bookmark) {
  if (event.key === 'Enter') {
    event.preventDefault()
    openWebsite(bookmark.url)
  } else if (
    (event.key === 'Backspace' && (event.metaKey || event.ctrlKey)) ||
    event.key === 'Delete'
  ) {
    event.preventDefault()
    void actions.remove(bookmark)
  }
}
</script>

<template>
  <UContextMenu :items="contextItems" :content="keepMovedFocus">
    <div
      class="flex shrink-0 grow flex-col"
      data-testid="unsorted"
      @contextmenu.capture="onContextMenu"
    >
      <div class="flex items-center justify-between ps-1 pe-2.5 pb-1">
        <div class="flex min-w-0 items-center gap-1">
          <button
            type="button"
            class="grid size-5 place-items-center rounded text-muted hover:text-default"
            :aria-expanded="open"
            :aria-label="open ? 'Fold Unsorted' : 'Unfold Unsorted'"
            data-testid="unsorted-toggle"
            @click="open = !open"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3.5 transition-transform"
              :class="open && 'rotate-90'"
            />
          </button>
          <UTooltip :text="inboxId ? 'Open the inbox note' : 'Bookmarks still to sort'">
            <button
              type="button"
              class="rounded px-0.5 text-xs font-medium text-muted hover:text-default"
              data-testid="unsorted-title"
              @click="inboxId ? openInbox() : (open = !open)"
            >
              Unsorted
            </button>
          </UTooltip>
          <UBadge
            v-if="list.length"
            :label="String(list.length)"
            size="sm"
            color="neutral"
            variant="soft"
            data-testid="unsorted-count"
          />
        </div>
        <UTooltip text="New bookmark">
          <UButton
            icon="i-lucide-plus"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="New bookmark"
            data-testid="unsorted-new"
            @click="actions.create({ inbox: true })"
          />
        </UTooltip>
      </div>

      <div v-if="open" class="grow px-1 pb-2">
        <ul v-if="list.length" class="flex flex-col">
          <li v-for="bookmark in list" :key="bookmark.id">
            <div
              role="button"
              tabindex="0"
              class="tree-row group relative flex h-7 items-center gap-1.5 rounded-md ps-2 pe-1 text-sm transition-colors select-none"
              :class="[
                currentId === bookmark.id
                  ? 'bg-elevated font-medium text-highlighted'
                  : 'text-default hover:bg-elevated/60',
                dragged === bookmark.id && 'opacity-50',
              ]"
              :data-current="currentId === bookmark.id || undefined"
              :data-unsorted-id="bookmark.id"
              :data-testid="`unsorted-${bookmark.title}`"
              :title="bookmark.url"
              draggable="true"
              @click="edit(bookmark, $event)"
              @dblclick="openWebsite(bookmark.url)"
              @keydown="onRowKeydown($event, bookmark)"
              @dragstart="onDragStart($event, bookmark)"
              @dragend="dragged = null"
            >
              <BookmarkIcon :bookmark="bookmark" />
              <span class="min-w-0 flex-1 truncate">{{ bookmark.title }}</span>
              <div
                class="tree-row-actions absolute inset-y-0 end-0 flex items-center rounded-e-md ps-6 pe-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                @click.stop
                @dblclick.stop
              >
                <UDropdownMenu
                  :items="menu(bookmark)"
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
          </li>
        </ul>
        <p
          v-else-if="bookmarks.loaded.value"
          class="px-2 py-1 text-xs text-muted"
          data-testid="unsorted-empty"
        >
          Nothing to sort. Bookmarks saved from Chrome with Tandem’s extension land here, to drag
          into your notes.
        </p>
      </div>
    </div>
  </UContextMenu>
</template>
