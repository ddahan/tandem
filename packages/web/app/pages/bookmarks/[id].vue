<script setup lang="ts">
// A bookmark, or a folder of bookmarks, shown as a page (a click in the sidebar opens it in the
// preview tab, as a page's). Everything is edited in place, saved when a field is left: a
// bookmark's name, address, description and folder; a folder's name and place, and what it
// holds (opened from here). The pages showing a bookmark's card are listed; deleting asks first.
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
const folder = computed(() => bookmark.value?.kind === 'folder')
const folders = computed(() => bookmarks.foldersOf(id.value))
const contents = computed(() => bookmarks.childrenOf.value.get(id.value) ?? [])
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

// The folder it's in (a select: moved at once). Its value can't be empty: the top is `top`.
const TOP = 'top'
const folderItems = computed(() =>
  bookmarks
    .folderOptions(folder.value ? id.value : undefined)
    .map((option) => ({ value: option.id ?? TOP, label: option.label, depth: option.depth })),
)
const parentValue = computed({
  get: () => bookmark.value?.parentId ?? TOP,
  set: (value: string) => {
    const parentId = value === TOP ? null : value
    if (!bookmark.value || parentId === bookmark.value.parentId) return
    bookmarks.move(id.value, parentId).catch((error: unknown) => showError(error, 'Could not move'))
  },
})

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

function openInside(item: Bookmark) {
  void tabs.preview(`/bookmarks/${item.id}`)
}

function activate(item: Bookmark) {
  if (item.kind === 'bookmark') openWebsite(item.url)
  else void tabs.open(`/bookmarks/${item.id}`)
}

async function newFolder() {
  try {
    const made = await bookmarks.create({ kind: 'folder', title: 'New folder', parentId: id.value })
    await tabs.open(`/bookmarks/${made.id}`)
  } catch (error) {
    showError(error, 'Could not make the folder')
  }
}

async function remove() {
  // Its tab closes by itself once it's gone (default.vue).
  if (bookmark.value) await actions.remove(bookmark.value)
}

const fieldUi = {
  base: 'px-2 -mx-2 hover:bg-elevated/50 focus:bg-elevated/50 rounded-md',
  root: 'w-full',
}

/** The icon picker, open (a folder's icon). */
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
          <!-- Its folders, as a page's breadcrumb. -->
          <nav
            class="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted"
            aria-label="Folders"
          >
            <UIcon name="i-lucide-bookmark" class="size-3.5" />
            <span>Bookmarks</span>
            <template v-for="parent in folders" :key="parent.id">
              <UIcon name="i-lucide-chevron-right" class="size-3" />
              <NuxtLink :to="`/bookmarks/${parent.id}`" class="hover:text-default hover:underline">
                {{ parent.title }}
              </NuxtLink>
            </template>
          </nav>

          <div class="flex items-center gap-3">
            <!-- A folder's icon is chosen here (and from its menu in the sidebar). -->
            <UTooltip v-if="folder" text="Change icon">
              <button
                type="button"
                class="rounded-md p-0.5 hover:bg-elevated"
                aria-label="Change icon"
                @click="choosingIcon = true"
              >
                <BookmarkIcon :bookmark="bookmark" size="lg" />
              </button>
            </UTooltip>
            <BookmarkIcon v-else :bookmark="bookmark" size="lg" />
            <UInput
              v-model="draft.title"
              variant="none"
              :placeholder="folder ? 'Folder name' : 'Name'"
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
            <template v-if="!folder">
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
            </template>

            <dt class="text-muted">{{ folder ? 'In' : 'Folder' }}</dt>
            <dd class="min-w-0">
              <USelectMenu
                v-model="parentValue"
                :items="folderItems"
                value-key="value"
                variant="ghost"
                :search-input="{ placeholder: 'Find a folder…' }"
                class="-mx-2 w-full max-w-xs"
                data-testid="bookmark-page-folder"
              >
                <template #item-label="{ item }">
                  <span :style="{ paddingInlineStart: `${item.depth * 0.75}rem` }">{{
                    item.label
                  }}</span>
                </template>
              </USelectMenu>
            </dd>

            <template v-if="!folder">
              <dt class="text-muted">Site</dt>
              <dd class="truncate">{{ siteOf(bookmark.url) }}</dd>
            </template>
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
              v-if="!folder"
              label="Open website"
              icon="i-lucide-external-link"
              size="sm"
              @click="openWebsite(bookmark.url)"
            />
            <UButton
              :label="folder ? 'Delete folder' : 'Delete bookmark'"
              icon="i-lucide-trash-2"
              color="error"
              variant="soft"
              size="sm"
              @click="remove"
            />
          </div>

          <!-- A folder: what it holds. -->
          <section v-if="folder" class="mt-10" aria-labelledby="bookmark-contents">
            <div class="mb-2 flex items-center justify-between">
              <h2 id="bookmark-contents" class="text-sm font-semibold text-highlighted">
                In this folder
              </h2>
              <div class="flex gap-1">
                <UButton
                  label="New bookmark"
                  icon="i-lucide-bookmark-plus"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="actions.create({ parentId: id })"
                />
                <UButton
                  label="New folder"
                  icon="i-lucide-folder-plus"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="newFolder"
                />
              </div>
            </div>
            <p v-if="!contents.length" class="text-sm text-muted">Nothing here yet.</p>
            <ul
              v-else
              class="divide-y divide-default rounded-lg border border-default"
              data-testid="bookmark-page-contents"
            >
              <li v-for="item in contents" :key="item.id">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-elevated/50"
                  :title="item.kind === 'bookmark' ? item.url : undefined"
                  @click="openInside(item)"
                  @dblclick="activate(item)"
                >
                  <BookmarkIcon :bookmark="item" size="md" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-highlighted">{{
                      item.title
                    }}</span>
                    <span
                      v-if="item.kind === 'bookmark'"
                      class="block truncate text-xs text-muted"
                      >{{ siteOf(item.url) }}</span
                    >
                  </span>
                  <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
                </button>
              </li>
            </ul>
          </section>

          <!-- A bookmark: the pages showing its card. -->
          <section v-else class="mt-10" aria-labelledby="bookmark-pages">
            <h2 id="bookmark-pages" class="mb-2 text-sm font-semibold text-highlighted">
              Shown in
            </h2>
            <p v-if="pages && !pages.length" class="text-sm text-muted">
              No page shows it yet: type /bookmark in a note, or drag it from the sidebar into one.
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
