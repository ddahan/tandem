<script setup lang="ts">
// A bookmark, edited where it is shown: in its card in a note (BookmarkView, "Edit"), or in a
// popover next to its row (Unsorted, the side panel: BookmarkEditPopover). Bookmarks have no page
// of their own. Each field is saved when it is left: its name, address and description; its icon
// (a click on it). Under them, the pages showing its card, its dates, and its actions (the
// website, deleting it once confirmed). ↵ in a one-line field and Esc anywhere close it (`done`).
import { formatDateTime, siteOf, type Bookmark, type BookmarkRef } from '@tandem/shared'
import { openWebsite } from '~/composables/useBookmarks'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ done: [] }>()

const bookmarks = useBookmarks()
const actions = useBookmarkActions()
const showError = useApiErrorToast()
const toast = useToast()

const bookmark = computed(() => bookmarks.byId.value.get(props.id) ?? null)

type Field = 'title' | 'url' | 'description'
const draft = reactive({ title: '', url: '', description: '' })
/** The field being typed in: a change from elsewhere doesn't replace it. */
const editing = ref<Field | null>(null)

watch(
  bookmark,
  (current) => {
    if (!current) return
    for (const field of ['title', 'url', 'description'] as const) {
      if (editing.value !== field) draft[field] = current[field]
    }
  },
  { immediate: true },
)

async function save(field: Field) {
  editing.value = null
  const current = bookmark.value
  if (!current) return
  const value = field === 'description' ? draft[field] : draft[field].trim()
  if (value === current[field]) return
  if (field !== 'description' && !value) {
    draft[field] = current[field]
    return
  }
  try {
    await bookmarks.update(current.id, { [field]: value })
  } catch (error) {
    draft[field] = current[field]
    const existing =
      error instanceof ApiError && error.status === 409
        ? (error.body as { bookmark?: Bookmark } | null)?.bookmark
        : undefined
    if (existing) {
      toast.add({
        title: `Already bookmarked as “${existing.title}”`,
        icon: 'i-lucide-bookmark-check',
        color: 'warning',
      })
    } else showError(error, 'Could not save the bookmark')
  }
}

/** ↵ in a one-line field saves it and closes; Esc puts the field back as it was and closes. */
function onKey(event: KeyboardEvent, field: Field) {
  const target = event.target as HTMLInputElement
  if (event.key === 'Enter' && field !== 'description') {
    event.preventDefault()
    target.blur()
    emit('done')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (bookmark.value) draft[field] = bookmark.value[field]
    editing.value = null
    emit('done')
  }
}

// --- The pages showing it ------------------------------------------------------------------------

const pages = ref<BookmarkRef[] | null>(null)
async function loadPages() {
  pages.value = bookmark.value ? await bookmarks.refs(props.id).catch(() => []) : []
}
watch(() => props.id, loadPages, { immediate: true })
useServerEvents((event) => {
  if (['bookmarks', 'note', 'tree', 'resync'].includes(event.type)) void loadPages()
})

async function remove() {
  if (bookmark.value && (await actions.remove(bookmark.value))) emit('done')
}

/** The icon picker, open. */
const choosingIcon = ref(false)

const titleInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('title')
onMounted(() => {
  // Shown to be edited: typing goes to its name.
  nextTick(() => titleInput.value?.inputRef?.focus())
})

const fieldUi = {
  base: 'px-1.5 -mx-1.5 py-0.5 hover:bg-elevated/60 focus:bg-elevated/60 rounded-md',
  root: 'w-full',
}
</script>

<template>
  <div class="flex flex-col gap-2 text-sm" data-testid="bookmark-fields">
    <p v-if="!bookmark" class="text-muted">This bookmark doesn't exist anymore.</p>
    <template v-else>
      <div class="flex items-center gap-2">
        <UTooltip text="Change icon">
          <button
            type="button"
            class="shrink-0 rounded-md p-0.5 hover:bg-elevated"
            aria-label="Change icon"
            @click="choosingIcon = true"
          >
            <BookmarkIcon :bookmark="bookmark" size="lg" />
          </button>
        </UTooltip>
        <UInput
          ref="title"
          v-model="draft.title"
          variant="none"
          placeholder="Name"
          aria-label="Name"
          class="min-w-0 flex-1"
          :ui="{ ...fieldUi, base: `${fieldUi.base} font-medium text-highlighted` }"
          data-testid="bookmark-title-field"
          @focus="editing = 'title'"
          @blur="save('title')"
          @keydown="onKey($event, 'title')"
        />
      </div>
      <UInput
        v-model="draft.url"
        variant="none"
        placeholder="Address"
        aria-label="Address"
        :ui="{ ...fieldUi, base: `${fieldUi.base} text-muted` }"
        data-testid="bookmark-url-field"
        @focus="editing = 'url'"
        @blur="save('url')"
        @keydown="onKey($event, 'url')"
      />
      <UTextarea
        v-model="draft.description"
        variant="none"
        placeholder="Add a description…"
        aria-label="Description"
        autoresize
        :rows="1"
        :maxrows="10"
        :ui="fieldUi"
        data-testid="bookmark-description-field"
        @focus="editing = 'description'"
        @blur="save('description')"
        @keydown="onKey($event, 'description')"
      />

      <p class="text-xs text-dimmed">
        {{ siteOf(bookmark.url) }} · Added {{ formatDateTime(bookmark.createdAt) }}
        <template v-if="bookmark.updatedAt !== bookmark.createdAt">
          · Changed {{ formatDateTime(bookmark.updatedAt) }}
        </template>
      </p>

      <div v-if="pages?.length" class="text-xs" data-testid="bookmark-pages">
        <span class="text-muted">Shown in </span>
        <template v-for="(page, i) in pages" :key="page.id">
          <NuxtLink :to="`/notes/${page.id}`" class="text-default hover:underline">{{
            page.path.replace(/\.md$/, '')
          }}</NuxtLink
          ><span v-if="i < pages.length - 1" class="text-muted">, </span>
        </template>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 pt-1">
        <UButton
          label="Open website"
          icon="i-lucide-external-link"
          size="xs"
          color="neutral"
          variant="soft"
          @click="openWebsite(bookmark.url)"
        />
        <UButton
          label="Delete"
          icon="i-lucide-trash-2"
          size="xs"
          color="error"
          variant="ghost"
          @click="remove"
        />
        <UButton
          label="Done"
          size="xs"
          class="ms-auto"
          data-testid="bookmark-done"
          @click="emit('done')"
        />
      </div>
    </template>

    <UModal
      v-model:open="choosingIcon"
      :title="bookmark ? `Icon of “${bookmark.title}”` : ''"
      :ui="{ content: 'max-w-fit', body: 'p-0 sm:p-0' }"
    >
      <template #body>
        <LazyIconPicker
          v-if="bookmark"
          :bookmark-id="bookmark.id"
          :has-icon="!!(bookmark.emoji || bookmark.icon)"
          @done="choosingIcon = false"
        />
      </template>
    </UModal>
  </div>
</template>
