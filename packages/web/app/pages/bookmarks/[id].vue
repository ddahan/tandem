<script setup lang="ts">
// A bookmark shown as a page (a click in Unsorted or in the side panel opens it in the preview
// tab, as a page's). Everything is edited in place, saved when a field is left: its name,
// address and description, and its icon. The pages showing its card are listed (what organizes
// bookmarks); deleting asks first.
import { formatDateTime, siteOf, type Bookmark, type BookmarkRef } from '@tandem/shared'
import { openWebsite } from '~/composables/useBookmarks'

const route = useRoute()
const id = computed(() => String(route.params.id))
const bookmarks = useBookmarks()
const actions = useBookmarkActions()
const tabs = useTabs()
const showError = useApiErrorToast()
const toast = useToast()

const bookmark = computed(() => bookmarks.byId.value.get(id.value) ?? null)
useHead({ title: () => bookmark.value?.title ?? 'Bookmark' })

// --- Editing in place ----------------------------------------------------------------------------

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
    // Edited, a preview is kept open, as a note is.
    tabs.keepOpen(`bookmark:${current.id}`)
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
        actions: [{ label: 'Show it', onClick: () => void tabs.open(`/bookmarks/${existing.id}`) }],
      })
    } else showError(error, 'Could not save the bookmark')
  }
}

/** ↵ in a one-line field saves it (by leaving it); Esc puts it back as it was. */
function onKey(event: KeyboardEvent, field: Field) {
  const target = event.target as HTMLInputElement
  if (event.key === 'Enter' && field !== 'description') {
    event.preventDefault()
    target.blur()
  } else if (event.key === 'Escape' && bookmark.value) {
    draft[field] = bookmark.value[field]
    editing.value = null
    target.blur()
  }
}

// --- The pages showing it ----------------------------------------------------------------------

const pages = ref<BookmarkRef[] | null>(null)
async function loadPages() {
  pages.value = bookmark.value ? await bookmarks.refs(id.value).catch(() => []) : []
}
watch(id, loadPages, { immediate: true })
useServerEvents((event) => {
  if (['bookmarks', 'note', 'tree', 'resync'].includes(event.type)) void loadPages()
})

// --- Actions ----------------------------------------------------------------------------------

async function remove() {
  // Its tab closes by itself once it's gone (default.vue).
  if (bookmark.value) await actions.remove(bookmark.value)
}

const fieldUi = {
  base: 'px-2 -mx-2 hover:bg-elevated/50 focus:bg-elevated/50 rounded-md',
  root: 'w-full',
}

/** The icon picker, open. */
const choosingIcon = ref(false)
</script>

<template>
  <UDashboardPanel id="bookmark">
    <template #header>
      <PageNavbar :title="bookmark?.title ?? 'Bookmark'" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl px-1 py-6 sm:py-10" data-testid="bookmark-page">
        <UEmpty
          v-if="!bookmark && bookmarks.loaded.value"
          icon="i-lucide-bookmark-x"
          title="This bookmark doesn't exist anymore"
          variant="naked"
        />

        <template v-else-if="bookmark">
          <div class="flex items-center gap-3">
            <UTooltip text="Change icon">
              <button
                type="button"
                class="rounded-md p-0.5 hover:bg-elevated"
                aria-label="Change icon"
                @click="choosingIcon = true"
              >
                <BookmarkIcon :bookmark="bookmark" size="lg" />
              </button>
            </UTooltip>
            <UInput
              v-model="draft.title"
              variant="none"
              placeholder="Name"
              aria-label="Name"
              class="min-w-0 flex-1"
              :ui="{
                ...fieldUi,
                base: `${fieldUi.base} text-3xl! leading-tight font-bold tracking-tight text-highlighted`,
              }"
              data-testid="bookmark-page-title"
              @focus="editing = 'title'"
              @blur="save('title')"
              @keydown="onKey($event, 'title')"
            />
          </div>

          <dl
            class="mt-6 grid grid-cols-[7rem_1fr] items-center gap-x-4 gap-y-2 text-sm"
            data-testid="bookmark-page-fields"
          >
            <dt class="text-muted">Address</dt>
            <dd class="flex min-w-0 items-center gap-1">
              <UInput
                v-model="draft.url"
                variant="none"
                aria-label="Address"
                class="min-w-0 flex-1"
                :ui="fieldUi"
                data-testid="bookmark-page-url"
                @focus="editing = 'url'"
                @blur="save('url')"
                @keydown="onKey($event, 'url')"
              />
            </dd>

            <dt class="self-start pt-1.5 text-muted">Description</dt>
            <dd class="min-w-0">
              <UTextarea
                v-model="draft.description"
                variant="none"
                placeholder="Add a description…"
                aria-label="Description"
                autoresize
                :rows="1"
                :maxrows="12"
                class="w-full"
                :ui="fieldUi"
                data-testid="bookmark-page-description"
                @focus="editing = 'description'"
                @blur="save('description')"
                @keydown="onKey($event, 'description')"
              />
            </dd>

            <dt class="text-muted">Site</dt>
            <dd class="truncate">{{ siteOf(bookmark.url) }}</dd>
            <dt class="text-muted">Added</dt>
            <dd>{{ formatDateTime(bookmark.createdAt) }}</dd>
            <template v-if="bookmark.updatedAt !== bookmark.createdAt">
              <dt class="text-muted">Changed</dt>
              <dd>{{ formatDateTime(bookmark.updatedAt) }}</dd>
            </template>
          </dl>

          <!-- Its actions, under what they act on. -->
          <div class="mt-6 flex flex-wrap gap-2">
            <UButton
              label="Open website"
              icon="i-lucide-external-link"
              size="sm"
              @click="openWebsite(bookmark.url)"
            />
            <UButton
              label="Delete bookmark"
              icon="i-lucide-trash-2"
              color="error"
              variant="soft"
              size="sm"
              @click="remove"
            />
          </div>

          <!-- A bookmark: the pages showing its card. -->
          <section class="mt-10" aria-labelledby="bookmark-pages">
            <h2 id="bookmark-pages" class="mb-2 text-sm font-semibold text-highlighted">
              Shown in
            </h2>
            <p v-if="pages && !pages.length" class="text-sm text-muted">
              No page shows it: type /bookmark in a note to put its card there.
            </p>
            <ul v-else-if="pages" class="flex flex-col" data-testid="bookmark-pages">
              <li v-for="page in pages" :key="page.id">
                <NuxtLink
                  :to="`/notes/${page.id}`"
                  class="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-elevated/50"
                >
                  <UIcon name="i-lucide-file-text" class="size-4 text-dimmed" />
                  {{ page.path.replace(/\.md$/, '') }}
                </NuxtLink>
              </li>
            </ul>
          </section>
        </template>
      </div>
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
    </template>
  </UDashboardPanel>
</template>
