<script setup lang="ts">
// A bookmark block: the bookmark's card (favicon, name, site, description), as it is now: the
// data is in Tandem (useBookmarks), the note only names it. A click selects it, as any block
// (framed), and opens its menu (the website, the bookmark's page, another bookmark, removing
// it); the focus stays in the editor, so ⌫ deletes it and ⌘Z brings it back, as any content. A
// double click opens the website.
import type { DropdownMenuItem } from '@nuxt/ui'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { siteOf } from '@tandem/shared'
import { openWebsite } from '~/composables/useBookmarks'

const props = defineProps(nodeViewProps)

const bookmarks = useBookmarks()
const actions = useBookmarkActions()
const id = computed(() => String(props.node.attrs.id ?? ''))
const bookmark = computed(() => bookmarks.byId.value.get(id.value) ?? null)
const missing = computed(() => bookmarks.loaded.value && !bookmark.value)
const editable = computed(() => props.editor.isEditable)
const tabs = useTabs()

const menuOpen = ref(false)

function open() {
  if (bookmark.value) openWebsite(bookmark.value.url)
}

/** Selects the card in the editor: keys go there (⌫ deletes it). */
function selectNode() {
  const pos = props.getPos()
  if (props.editor.isEditable && typeof pos === 'number') {
    props.editor.chain().focus().setNodeSelection(pos).run()
  }
}

/** A click on the card: selected, its menu shown. */
function select() {
  selectNode()
  if (bookmark.value) menuOpen.value = true
}

/** Out of the note, through the editor: ⌘Z brings it back. */
function remove() {
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  props.editor.chain().focus().setNodeSelection(pos).deleteSelection().run()
}

async function change() {
  const picked = await actions.pick()
  if (picked) props.updateAttributes({ id: picked })
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Open website', icon: 'i-lucide-external-link', onSelect: open },
    {
      label: 'Show the bookmark',
      icon: 'i-lucide-bookmark',
      onSelect: () => void tabs.open(`/bookmarks/${id.value}`),
    },
  ],
  ...(editable.value
    ? [
        [
          {
            label: 'Change bookmark…',
            icon: 'i-lucide-replace',
            onSelect: () => void change(),
          },
          {
            label: 'Remove from the note',
            icon: 'i-lucide-x',
            kbds: ['backspace'],
            onSelect: remove,
          },
        ],
      ]
    : []),
])
</script>

<template>
  <NodeViewWrapper
    class="bookmark-block my-4"
    :class="selected && 'is-selected'"
    :data-bookmark-id="id"
    contenteditable="false"
    data-testid="bookmark-card"
  >
    <div
      v-if="missing"
      class="flex items-center gap-2 rounded-md border border-dashed border-default px-3 py-2 text-sm text-muted"
      @click="select"
    >
      <UIcon name="i-lucide-bookmark-x" class="size-4" />
      This bookmark doesn't exist anymore.
      <UButton
        v-if="editable"
        label="Remove"
        size="xs"
        color="neutral"
        variant="ghost"
        class="ms-auto"
        @click.stop="remove"
      />
    </div>
    <div
      v-else
      class="group relative flex cursor-pointer items-center gap-3 rounded-md border border-default bg-default px-3 py-2.5 transition-colors hover:bg-elevated/50"
      :title="bookmark?.url"
      @click="select"
      @dblclick="open"
    >
      <BookmarkIcon :bookmark="bookmark" size="lg" />
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium text-highlighted">{{ bookmark?.title ?? '…' }}</p>
        <p v-if="bookmark" class="truncate text-xs text-muted">{{ siteOf(bookmark.url) }}</p>
        <p
          v-if="bookmark?.description"
          class="mt-0.5 line-clamp-2 text-sm text-default"
          data-testid="bookmark-card-description"
        >
          {{ bookmark.description }}
        </p>
      </div>
      <div
        class="shrink-0 self-start group-hover:opacity-100"
        :class="menuOpen || selected ? 'opacity-100' : 'opacity-0'"
        @click.stop="selectNode"
      >
        <!-- Not modal, and the focus left in the editor: ⌫ deletes the selected card. -->
        <UDropdownMenu
          v-if="bookmark"
          v-model:open="menuOpen"
          :items="menu"
          :modal="false"
          :content="{
            align: 'end',
            onOpenAutoFocus: (event: Event) => event.preventDefault(),
            onCloseAutoFocus: (event: Event) => event.preventDefault(),
          }"
        >
          <UButton
            icon="i-lucide-ellipsis"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Bookmark actions"
          />
        </UDropdownMenu>
      </div>
    </div>
  </NodeViewWrapper>
</template>
