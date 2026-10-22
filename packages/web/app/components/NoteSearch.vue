<script setup lang="ts">
// The search palette (⌘⇧F), the app's only search: full-text search on the server as you type,
// syntax tips while the query is empty, and a few actions. Opened from anywhere with
// useSearchPalette(). With bookmarks on, they're searched too: picking one opens its website.
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import { refDebounced } from '@vueuse/core'
import { siteOf, type BookmarkSearchResult, type SearchResponse } from '@tandem/shared'
import { openWebsite } from '~/composables/useBookmarks'

const api = useApi()
const tree = useTree()
const colorMode = useColorMode()
const { settings } = useSettings()
const daily = useDaily()
const bookmarkActions = useBookmarkActions()

const { open, term: searchTerm } = useSearchPalette()
const debounced = refDebounced(searchTerm, 120)
const response = ref<SearchResponse | null>(null)
const bookmarkResults = ref<BookmarkSearchResult[]>([])
const loading = ref(false)
let latest = 0

watch(
  debounced,
  async (q) => {
    const request = ++latest
    loading.value = true
    try {
      // Bookmarks only for words typed: before, the palette shows recent notes.
      const [result, found] = await Promise.all([
        unwrap(api.search.$get({ query: { q, limit: '20' } })),
        settings.value.bookmarks && q.trim()
          ? unwrap(api.bookmarks.search.$get({ query: { q, limit: '8' } })).catch(() => [])
          : Promise.resolve([]),
      ])
      if (request === latest) {
        response.value = result
        bookmarkResults.value = found
      }
    } finally {
      if (request === latest) loading.value = false
    }
  },
  { immediate: true },
)

const TIPS: [string, string][] = [
  ['"exact phrase"', 'an exact phrase'],
  ['-draft', 'without a word'],
  ['tag:work', 'notes with a tag'],
  ['in:Projects', 'notes in a folder'],
]

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const results = response.value?.results ?? []
  const corrected = response.value?.correctedQuery
  return [
    {
      id: 'notes',
      label: !searchTerm.value.trim()
        ? 'Recent'
        : corrected
          ? `Showing results for “${corrected}”`
          : 'Notes',
      ignoreFilter: true,
      items: results.map((result) => {
        const parents = tree
          .ancestors(result.id)
          .slice(0, -1)
          .map((n) => n.title)
          .join(' / ')
        return {
          id: result.id,
          label: result.title,
          suffix: parents,
          descriptionHtml: result.snippet || undefined,
          slot: 'note' as const,
          nodeIcon: result.icon,
          to: `/notes/${result.id}`,
          class: 'search-snippet',
        }
      }),
    },
    ...(bookmarkResults.value.length
      ? [
          {
            id: 'bookmarks',
            label: 'Bookmarks',
            ignoreFilter: true,
            items: bookmarkResults.value.map(({ bookmark, titleHtml, folders }) => ({
              id: `bookmark-${bookmark.id}`,
              label: bookmark.title,
              labelHtml: titleHtml,
              suffix: [siteOf(bookmark.url), folders].filter(Boolean).join(' · '),
              slot: 'bookmark' as const,
              bookmark,
              class: 'search-snippet',
              onSelect: () => openWebsite(bookmark.url),
            })),
          },
        ]
      : []),
    ...(searchTerm.value.trim()
      ? []
      : [
          {
            id: 'tips',
            label: 'Search tips',
            // `tag:` still filters with tags off, but isn't offered.
            items: TIPS.filter(
              ([example]) => settings.value.tags || !example.startsWith('tag:'),
            ).map(([example, description]) => ({
              label: example,
              suffix: description,
              icon: 'i-lucide-lightbulb',
              // Selecting a tip puts it in the search field.
              onSelect: (event: Event) => {
                event.preventDefault()
                searchTerm.value = `${example} `
              },
            })),
          },
        ]),
    {
      id: 'actions',
      label: 'Actions',
      items: [
        {
          label: 'New page',
          icon: 'i-lucide-file-plus',
          kbds: ['meta', 'alt', 'n'],
          onSelect: () => void tree.createPage(),
        },
        ...(settings.value.bookmarks
          ? [
              {
                label: 'New bookmark',
                icon: 'i-lucide-bookmark-plus',
                onSelect: () => void bookmarkActions.create(),
              },
            ]
          : []),
        ...(settings.value.daily
          ? [
              {
                label: 'Today’s note',
                icon: 'i-lucide-calendar-days',
                onSelect: () => void daily.open(),
              },
            ]
          : []),
        ...(settings.value.trash
          ? [{ label: 'Trash', icon: 'i-lucide-trash-2', to: '/trash' }]
          : []),
        { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
        { label: 'Docs', icon: 'i-lucide-book-open', to: '/docs' },
        {
          label: 'Keyboard shortcuts',
          icon: 'i-lucide-keyboard',
          kbds: ['meta', '/'],
          to: '/docs/shortcuts',
        },
        {
          label: colorMode.value === 'dark' ? 'Light mode' : 'Dark mode',
          icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
          onSelect: () => (colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'),
        },
      ],
    },
  ]
})
</script>

<template>
  <UDashboardSearch
    v-model:open="open"
    v-model:search-term="searchTerm"
    :groups="groups"
    :loading="loading"
    :color-mode="false"
    shortcut=""
    placeholder='Search notes… (tag:x, in:Folder, -word, "phrase")'
    :fuse="{ resultLimit: 20 }"
  >
    <template #note-leading="{ item }">
      <NodeIcon :icon="item.nodeIcon" kind="page" size="md" />
    </template>
    <template #bookmark-leading="{ item }">
      <BookmarkIcon :bookmark="item.bookmark" size="md" />
    </template>
  </UDashboardSearch>
</template>
