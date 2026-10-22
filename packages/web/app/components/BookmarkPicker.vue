<script setup lang="ts">
// Picks a bookmark to show in a note (`/bookmark`, a card's "Change bookmark"): a search over
// their names, addresses and descriptions (the server's, as the palette's), the latest first
// before typing. An address that isn't bookmarked yet can be added from here.
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import { refDebounced } from '@vueuse/core'
import { siteOf, webUrl, type Bookmark, type BookmarkSearchResult } from '@tandem/shared'

const emit = defineEmits<{ close: [id: string | null] }>()

const api = useApi()
const actions = useBookmarkActions()
const term = ref('')
const debounced = refDebounced(term, 120)
const results = ref<BookmarkSearchResult[]>([])
const loading = ref(false)
let latest = 0

watch(
  debounced,
  async (q) => {
    const request = ++latest
    loading.value = true
    try {
      const found = await unwrap(api.bookmarks.search.$get({ query: { q, limit: '30' } }))
      if (request === latest) results.value = found
    } catch {
      if (request === latest) results.value = []
    } finally {
      if (request === latest) loading.value = false
    }
  },
  { immediate: true },
)

/** What's typed, when it's a web address (with a dot, or a scheme: not a plain word). */
const typedUrl = computed(() => {
  const text = term.value.trim()
  return /^[a-z][a-z0-9+.-]*:\/\/|^[^\s/]+\.[^\s/]{2,}/i.test(text) ? webUrl(text) : null
})

async function addNew(url: string) {
  const created: Bookmark | null = await actions.create({ url })
  if (created) emit('close', created.id)
}

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [
  {
    id: 'bookmarks',
    label: term.value.trim() ? 'Bookmarks' : 'Latest bookmarks',
    ignoreFilter: true,
    items: results.value.map(({ bookmark, titleHtml, folders }) => ({
      id: bookmark.id,
      label: bookmark.title,
      labelHtml: titleHtml,
      suffix: [siteOf(bookmark.url), folders].filter(Boolean).join(' · '),
      slot: 'bookmark' as const,
      bookmark,
      onSelect: () => emit('close', bookmark.id),
    })),
  },
  ...(typedUrl.value
    ? [
        {
          id: 'new',
          label: 'New',
          ignoreFilter: true,
          items: [
            {
              label: `Add ${typedUrl.value} as a new bookmark`,
              icon: 'i-lucide-bookmark-plus',
              onSelect: () => void addNew(typedUrl.value!),
            },
          ],
        },
      ]
    : []),
])
</script>

<template>
  <UModal
    :ui="{ content: 'max-w-xl' }"
    title="Show a bookmark"
    description="Its card goes where the cursor is."
    @update:open="(open) => !open && emit('close', null)"
  >
    <template #content>
      <UCommandPalette
        v-model:search-term="term"
        :groups="groups"
        :loading="loading"
        placeholder="Find a bookmark, or paste an address…"
        class="h-96"
        close
        data-testid="bookmark-picker"
        @update:open="(open: boolean) => !open && emit('close', null)"
      >
        <template #bookmark-leading="{ item }">
          <BookmarkIcon :bookmark="item.bookmark" size="md" />
        </template>
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            {{
              term.trim()
                ? 'No bookmark matches. Paste an address to add one.'
                : 'No bookmarks yet. Paste an address to add one.'
            }}
          </p>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
