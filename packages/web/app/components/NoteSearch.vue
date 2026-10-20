<script setup lang="ts">
// The search palette (⌘⇧F), the app's only search: full-text search on the server as you type,
// syntax tips while the query is empty, and a few actions. Opened from anywhere with
// useSearchPalette().
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import { refDebounced } from '@vueuse/core'
import type { SearchResponse } from '@tandem/shared'

const api = useApi()
const tree = useTree()
const colorMode = useColorMode()

const { open, term: searchTerm } = useSearchPalette()
const debounced = refDebounced(searchTerm, 120)
const response = ref<SearchResponse | null>(null)
const loading = ref(false)
let latest = 0

watch(
  debounced,
  async (q) => {
    const request = ++latest
    loading.value = true
    try {
      const result = await unwrap(api.search.$get({ query: { q, limit: '20' } }))
      if (request === latest) response.value = result
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
    ...(searchTerm.value.trim()
      ? []
      : [
          {
            id: 'tips',
            label: 'Search tips',
            items: TIPS.map(([example, description]) => ({
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
        { label: 'Trash', icon: 'i-lucide-trash-2', to: '/trash' },
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
  </UDashboardSearch>
</template>
