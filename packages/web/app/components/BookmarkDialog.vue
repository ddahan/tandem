<script setup lang="ts">
// Making a bookmark, opened by useBookmarkActions (editing one is done where it shows: BookmarkFields).
// Its name and description are read from its page once its address is typed (the server
// fetches it), unless already filled. A page already bookmarked says so: its bookmark is used
// (one per page), its card shown where this one was asked for. `inbox`: its card goes at the
// start of the inbox note (Unsorted's "+"); otherwise the caller puts it (a note's `/bookmark`).
import type { Bookmark } from '@tandem/shared'

const props = defineProps<{ url?: string; inbox?: boolean }>()
const emit = defineEmits<{ close: [saved: Bookmark | null] }>()

const bookmarks = useBookmarks()
const api = useApi()
const showError = useApiErrorToast()

const url = ref(props.url ?? '')
const title = ref('')
const description = ref('')
const saving = ref(false)
const reading = ref(false)
const existing = ref<Bookmark | null>(null)

// Its name and description, from its page (what the browser extension also does), unless it
// is already bookmarked.
let lastRead = ''
async function readPage() {
  const address = url.value.trim()
  if (!address || address === lastRead) return
  lastRead = address
  reading.value = true
  try {
    const found = await unwrap(api.bookmarks.lookup.$get({ query: { url: address } }))
    existing.value = found.bookmark
    if (found.bookmark) return
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
watch(url, () => {
  if (existing.value && url.value.trim() !== lastRead) existing.value = null
})

async function save() {
  if (saving.value) return
  saving.value = true
  // ↵ typed in the address: its page is read first.
  if (!title.value.trim()) await readPage()
  try {
    const { bookmark } = await bookmarks.create({
      url: url.value,
      title: title.value,
      description: description.value,
      ...(props.inbox ? { inbox: true } : {}),
    })
    emit('close', bookmark)
  } catch (error) {
    showError(error, 'Could not save the bookmark')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    title="New bookmark"
    :ui="{ content: 'max-w-lg' }"
    @update:open="(open) => !open && emit('close', null)"
  >
    <template #body>
      <form id="bookmark-form" class="flex flex-col gap-4" @submit.prevent="save">
        <UFormField label="Address" name="url">
          <UInput
            v-model="url"
            placeholder="https://…"
            class="w-full"
            autofocus
            :loading="reading"
            data-testid="bookmark-url"
            @blur="readPage"
          />
        </UFormField>
        <UFormField label="Name" name="title">
          <UInput
            v-model="title"
            placeholder="The page’s title"
            class="w-full"
            data-testid="bookmark-title"
          />
        </UFormField>
        <UFormField label="Description" name="description" hint="Optional">
          <UTextarea
            v-model="description"
            :rows="2"
            autoresize
            :maxrows="6"
            class="w-full"
            data-testid="bookmark-description"
          />
        </UFormField>
        <UAlert
          v-if="existing"
          color="info"
          variant="subtle"
          icon="i-lucide-bookmark-check"
          :title="`Already bookmarked as “${existing.title}”`"
          :description="`${usesLabel(existing) ?? 'One bookmark per page'}: its card is used${inbox ? ' in Unsorted' : ' here'}.`"
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
          :label="existing ? 'Use it' : 'Create'"
          :loading="saving"
          data-testid="bookmark-save"
        />
      </div>
    </template>
  </UModal>
</template>
