<script setup lang="ts">
// Deleting a bookmark or folder asks first (bookmarks have no trash), and says which pages show
// it: their cards go with it.
import type { Bookmark, BookmarkRef } from '@tandem/shared'

const props = defineProps<{ bookmark: Bookmark; pages: BookmarkRef[]; count: number }>()
const emit = defineEmits<{ close: [confirmed: boolean] }>()

const folder = computed(() => props.bookmark.kind === 'folder')
const what = computed(() => {
  if (!folder.value) return 'This cannot be undone.'
  const inside = props.count - 1
  return inside
    ? `It and the ${inside} ${inside === 1 ? 'bookmark or folder' : 'bookmarks and folders'} in it are deleted. This cannot be undone.`
    : 'This cannot be undone.'
})
</script>

<template>
  <UModal
    :title="`Delete “${bookmark.title}”?`"
    :description="what"
    :close="false"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template v-if="pages.length" #body>
      <div class="text-sm" data-testid="bookmark-delete-pages">
        <p class="mb-2">
          {{ folder ? 'Its bookmarks are' : 'It is' }} shown in
          {{ pages.length === 1 ? 'a page' : `${pages.length} pages` }}; the
          {{ folder ? 'cards' : 'card' }} will be removed from
          {{ pages.length === 1 ? 'it' : 'them' }}:
        </p>
        <ul class="flex flex-col gap-1">
          <li v-for="page in pages" :key="page.id">
            <NuxtLink
              :to="`/notes/${page.id}`"
              class="inline-flex items-center gap-1.5 text-primary hover:underline"
              @click="emit('close', false)"
            >
              <UIcon name="i-lucide-file-text" class="size-3.5" />
              {{ page.path.replace(/\.md$/, '') }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('close', false)" />
        <UButton
          label="Delete"
          color="error"
          icon="i-lucide-trash-2"
          autofocus
          data-testid="bookmark-delete-confirm"
          @click="emit('close', true)"
        />
      </div>
    </template>
  </UModal>
</template>
