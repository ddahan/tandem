<script setup lang="ts">
// Deleting a bookmark asks first (bookmarks have no trash), and says which pages show it: their
// cards go with it.
import type { Bookmark, BookmarkRef } from '@tandem/shared'

defineProps<{ bookmark: Bookmark; pages: BookmarkRef[] }>()
const emit = defineEmits<{ close: [confirmed: boolean] }>()
</script>

<template>
  <UModal
    :title="`Delete “${bookmark.title}”?`"
    :description="'This cannot be undone.'"
    :close="false"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template v-if="pages.length" #body>
      <div class="text-sm" data-testid="bookmark-delete-pages">
        <p class="mb-2">
          It is shown in {{ pages.length === 1 ? 'a page' : `${pages.length} pages` }}; the card
          will be removed from {{ pages.length === 1 ? 'it' : 'them' }}:
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
