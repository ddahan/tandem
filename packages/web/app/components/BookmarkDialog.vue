<script setup lang="ts">
// Creating or editing a bookmark (or renaming and moving a folder), opened by
// useBookmarkActions. A new bookmark's name and description are read from its page once its
// address is typed (the server fetches it), unless already filled. A page already bookmarked
// says so, and offers to edit that bookmark instead.
import type { Bookmark } from '@tandem/shared'

const props = defineProps<{
  /** The bookmark to edit; none for a new one. */
  bookmark?: Bookmark
  /** A new bookmark's folder and address. */
  parentId?: string | null
  url?: string
}>()
const emit = defineEmits<{ close: [saved: Bookmark | null] }>()

const bookmarks = useBookmarks()
const api = useApi()
const showError = useApiErrorToast()

const editing = ref<Bookmark | null>(props.bookmark ?? null)
const folder = computed(() => editing.value?.kind === 'folder')
const url = ref(props.bookmark?.url ?? props.url ?? '')
const title = ref(props.bookmark?.title ?? '')
const description = ref(props.bookmark?.description ?? '')
const parentId = ref<string | null>(
  props.bookmark ? props.bookmark.parentId : (props.parentId ?? null),
)
const saving = ref(false)
const reading = ref(false)
const duplicate = ref<Bookmark | null>(null)

// The top of the bookmarks, in the folder picker (whose values can't be empty).
const TOP = 'top'
const folders = computed(() =>
  bookmarks
    .folderOptions(editing.value?.kind === 'folder' ? editing.value.id : undefined)
    .map((option) => ({
      value: option.id ?? TOP,
      label: option.label,
      depth: option.depth,
    })),
)
const folderValue = computed({
  get: () => parentId.value ?? TOP,
  set: (value: string) => (parentId.value = value === TOP ? null : value),
})

// A new bookmark's name and description, from its page (what the browser extension also does).
let lastRead = ''
async function readPage() {
  const address = url.value.trim()
  if (editing.value || !address || address === lastRead) return
  lastRead = address
  reading.value = true
  try {
    const preview = await unwrap(api.bookmarks.preview.$post({ json: { url: address } }))
    if (!title.value.trim()) title.value = preview.title
    if (!description.value.trim()) description.value = preview.description
  } catch {
    // Not a page that can be read: the fields stay to fill.
  } finally {
    reading.value = false
  }
}
onMounted(() => {
  if (url.value) void readPage()
})

/** Edits the bookmark already saved for this page, instead of making another. */
function editDuplicate() {
  const existing = duplicate.value
  if (!existing) return
  duplicate.value = null
  editing.value = existing
  url.value = existing.url
  title.value = existing.title
  description.value = existing.description
  parentId.value = existing.parentId
}

async function save() {
  if (saving.value) return
  saving.value = true
  duplicate.value = null
  // Enter typed in the address: its page is read first.
  if (!editing.value && !title.value.trim()) await readPage()
  const fields = folder.value
    ? { title: title.value, parentId: parentId.value }
    : {
        url: url.value,
        title: title.value,
        description: description.value,
        parentId: parentId.value,
      }
  try {
    const saved = editing.value
      ? await bookmarks.update(editing.value.id, fields)
      : await bookmarks.create(fields)
    emit('close', saved)
  } catch (error) {
    const existing =
      error instanceof ApiError && error.status === 409
        ? (error.body as { bookmark?: Bookmark } | null)?.bookmark
        : undefined
    if (existing) duplicate.value = existing
    else showError(error, 'Could not save the bookmark')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :title="editing ? (folder ? 'Edit folder' : 'Edit bookmark') : 'New bookmark'"
    :ui="{ content: 'max-w-lg' }"
    @update:open="(open) => !open && emit('close', null)"
  >
    <template #body>
      <form id="bookmark-form" class="flex flex-col gap-4" @submit.prevent="save">
        <UFormField v-if="!folder" label="Address" name="url">
          <UInput
            v-model="url"
            placeholder="https://…"
            class="w-full"
            :autofocus="!editing"
            :loading="reading"
            data-testid="bookmark-url"
            @blur="readPage"
          />
        </UFormField>
        <UFormField label="Name" name="title">
          <UInput
            v-model="title"
            :placeholder="folder ? 'Folder name' : 'The page’s title'"
            class="w-full"
            :autofocus="!!editing"
            data-testid="bookmark-title"
          />
        </UFormField>
        <UFormField v-if="!folder" label="Description" name="description" hint="Optional">
          <UTextarea
            v-model="description"
            :rows="2"
            autoresize
            :maxrows="6"
            class="w-full"
            data-testid="bookmark-description"
          />
        </UFormField>
        <UFormField label="Folder" name="folder">
          <USelectMenu
            v-model="folderValue"
            :items="folders"
            value-key="value"
            :search-input="{ placeholder: 'Find a folder…' }"
            class="w-full"
            data-testid="bookmark-folder"
          >
            <template #item-label="{ item }">
              <span :style="{ paddingInlineStart: `${item.depth * 0.75}rem` }">{{
                item.label
              }}</span>
            </template>
          </USelectMenu>
        </UFormField>

        <UAlert
          v-if="duplicate"
          color="warning"
          variant="subtle"
          icon="i-lucide-bookmark-check"
          :title="`Already bookmarked as “${duplicate.title}”`"
          :actions="[
            { label: 'Edit it', color: 'neutral', variant: 'outline', onClick: editDuplicate },
          ]"
          data-testid="bookmark-duplicate"
        />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('close', null)" />
        <UButton
          type="submit"
          form="bookmark-form"
          :label="editing ? 'Save' : 'Create'"
          :loading="saving"
          data-testid="bookmark-save"
        />
      </div>
    </template>
  </UModal>
</template>
