<script setup lang="ts">
// A bookmark block: the bookmark's card (favicon, name, site, description), as it is now: the
// data is in Tandem (useBookmarks), the note only names it. A click opens the website; its menu
// shows its information, edits it, puts another bookmark here, or takes the card out.
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
const card = useTemplateRef<HTMLElement>('card')
const showingInfo = ref(false)

function open() {
  if (bookmark.value) openWebsite(bookmark.value.url)
}

async function change() {
  const picked = await actions.pick()
  if (picked) props.updateAttributes({ id: picked })
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Open website', icon: 'i-lucide-external-link', onSelect: open },
    { label: 'Show info', icon: 'i-lucide-info', onSelect: () => (showingInfo.value = true) },
    {
      label: 'Edit bookmark…',
      icon: 'i-lucide-pencil-line',
      onSelect: () => void (bookmark.value && actions.edit(bookmark.value)),
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
            onSelect: () => props.deleteNode(),
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
        @click="deleteNode()"
      />
    </div>
    <div
      v-else
      ref="card"
      class="group relative flex cursor-pointer items-center gap-3 rounded-md border border-default bg-default px-3 py-2.5 transition-colors hover:bg-elevated/50"
      role="link"
      :title="bookmark?.url"
      tabindex="-1"
      @click="open"
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
      <div class="shrink-0 self-start opacity-0 group-hover:opacity-100" @click.stop>
        <UDropdownMenu v-if="bookmark" :items="menu" :content="{ align: 'end' }">
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

    <UPopover
      :open="showingInfo"
      :reference="card ?? undefined"
      :content="{ side: 'bottom', align: 'start' }"
      @update:open="(value: boolean) => (showingInfo = value)"
    >
      <template #content>
        <BookmarkInfo v-if="showingInfo" :id="id" @done="showingInfo = false" />
      </template>
    </UPopover>
  </NodeViewWrapper>
</template>
