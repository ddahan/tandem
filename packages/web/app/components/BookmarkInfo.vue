<script setup lang="ts">
// What a click on a bookmark shows (the sidebar, a card's menu): its favicon, name, address,
// description, folder and dates, the pages showing its card, and what to do with it.
import { formatDateTime, siteOf, type BookmarkRef } from '@tandem/shared'
import { openWebsite } from '~/composables/useBookmarks'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ done: [] }>()

const bookmarks = useBookmarks()
const actions = useBookmarkActions()
const tabs = useTabs()
const bookmark = computed(() => bookmarks.byId.value.get(props.id) ?? null)
const folders = computed(() => bookmarks.foldersOf(props.id).map((folder) => folder.title))

// The pages showing it, reloaded when bookmarks or pages change (a card added or removed).
const pages = ref<BookmarkRef[] | null>(null)
async function loadPages() {
  pages.value = await bookmarks.refs(props.id).catch(() => [])
}
watch(() => props.id, loadPages, { immediate: true })
useServerEvents((event) => {
  if (event.type === 'bookmarks' || event.type === 'note' || event.type === 'tree') void loadPages()
})

function open() {
  if (bookmark.value) openWebsite(bookmark.value.url)
  emit('done')
}

function openPage(id: string) {
  emit('done')
  void tabs.open(`/notes/${id}`)
}

async function edit() {
  emit('done')
  if (bookmark.value) await actions.edit(bookmark.value)
}

async function remove() {
  emit('done')
  if (bookmark.value) await actions.remove(bookmark.value)
}
</script>

<template>
  <div v-if="bookmark" class="flex w-80 flex-col gap-3 p-3 text-sm" data-testid="bookmark-info">
    <div class="flex items-start gap-3">
      <BookmarkIcon :bookmark="bookmark" size="lg" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold break-words text-highlighted">{{ bookmark.title }}</p>
        <a
          :href="bookmark.url"
          target="_blank"
          rel="noopener noreferrer"
          class="block truncate text-muted hover:text-primary hover:underline"
          :title="bookmark.url"
          @click="emit('done')"
          >{{ bookmark.url }}</a
        >
      </div>
    </div>

    <p v-if="bookmark.description" class="text-default">{{ bookmark.description }}</p>

    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt class="text-muted">Site</dt>
      <dd class="truncate">{{ siteOf(bookmark.url) }}</dd>
      <dt class="text-muted">Folder</dt>
      <dd class="truncate">{{ folders.length ? folders.join(' / ') : 'Bookmarks' }}</dd>
      <dt class="text-muted">Added</dt>
      <dd>{{ formatDateTime(bookmark.createdAt) }}</dd>
      <template v-if="bookmark.updatedAt !== bookmark.createdAt">
        <dt class="text-muted">Changed</dt>
        <dd>{{ formatDateTime(bookmark.updatedAt) }}</dd>
      </template>
    </dl>

    <div>
      <p class="mb-1 text-xs font-medium text-muted">Used in</p>
      <p v-if="pages && !pages.length" class="text-xs text-dimmed">No page shows it.</p>
      <ul v-else-if="pages" class="flex flex-col" data-testid="bookmark-pages">
        <li v-for="page in pages" :key="page.id">
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-start hover:bg-elevated"
            @click="openPage(page.id)"
          >
            <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0 text-dimmed" />
            <span class="truncate">{{ page.title }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="flex items-center gap-1 border-t border-default pt-3">
      <UButton
        label="Open website"
        icon="i-lucide-external-link"
        size="sm"
        :kbds="['enter']"
        @click="open"
      />
      <UButton
        label="Edit"
        icon="i-lucide-pencil"
        size="sm"
        color="neutral"
        variant="ghost"
        @click="edit"
      />
      <UButton
        icon="i-lucide-trash-2"
        size="sm"
        color="error"
        variant="ghost"
        aria-label="Delete"
        class="ms-auto"
        @click="remove"
      />
    </div>
  </div>
</template>
