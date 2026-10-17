<script setup lang="ts">
import { formatRelative, type SearchResult, type TagCount } from '@myfluence/shared'

const api = useApi()
const tree = useTree()
const { settings } = useSettings()
const { openSearch } = useSearchPalette()

const recent = ref<SearchResult[]>([])
const tags = ref<TagCount[]>([])
async function load() {
  const [search, tagList] = await Promise.all([
    unwrap(api.search.$get({ query: { q: '', limit: '8' } })).catch(() => null),
    unwrap(api.tags.$get()).catch(() => []),
  ])
  recent.value = search?.results ?? []
  tags.value = tagList
}
await load()
useServerEvents((event) => {
  if (event.type !== 'settings') void load()
})

const pageCount = computed(() => tree.nodes.value.filter((n) => n.kind === 'page').length)
const greeting = computed(() => {
  const hour = new Date().getHours()
  const name =
    settings.value.displayName && settings.value.displayName !== 'Me'
      ? `, ${settings.value.displayName}`
      : ''
  return `${hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${name}`
})

useHead({ title: 'Home' })

const actions: { label: string; icon: string; to?: string; onClick?: () => void }[] = [
  { label: 'New page', icon: 'i-lucide-file-plus', onClick: () => void tree.createPage() },
  { label: 'Search', icon: 'i-lucide-search', onClick: () => openSearch() },
  { label: 'Settings', icon: 'i-lucide-palette', to: '/settings' },
]
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Home">
        <template #right>
          <UButton label="New page" icon="i-lucide-plus" size="sm" @click="tree.createPage()" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl py-8">
        <h1 class="text-3xl font-bold tracking-tight text-highlighted">{{ greeting }}</h1>
        <p class="mt-1 text-muted">
          {{ pageCount }} page{{ pageCount === 1 ? '' : 's' }} in your notes. Press
          <UKbd value="meta" /> <UKbd value="shift" /> <UKbd value="F" /> to search,
          <UKbd value="/" /> in a note for blocks.
        </p>

        <div class="mt-10 grid gap-3 sm:grid-cols-3">
          <UButton
            v-for="action in actions"
            :key="action.label"
            :label="action.label"
            :icon="action.icon"
            :to="action.to"
            color="neutral"
            variant="outline"
            size="lg"
            class="justify-start"
            @click="action.onClick?.()"
          />
        </div>

        <section class="mt-12">
          <h2 class="mb-3 text-xs font-medium tracking-wide text-dimmed uppercase">
            Recently updated
          </h2>
          <div
            v-if="recent.length"
            class="divide-y divide-default overflow-hidden rounded-lg border border-default"
          >
            <NuxtLink
              v-for="note in recent"
              :key="note.id"
              :to="`/notes/${note.id}`"
              class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated/60"
            >
              <NodeIcon :icon="note.icon" kind="page" size="md" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-default">{{ note.title }}</span>
                <span class="block truncate text-xs text-dimmed">{{
                  note.path.replace(/\.md$/, '')
                }}</span>
              </span>
              <span class="flex shrink-0 gap-1">
                <UBadge
                  v-for="tag in note.tags.slice(0, 3)"
                  :key="tag"
                  :label="tag"
                  size="sm"
                  variant="soft"
                  color="neutral"
                />
              </span>
              <span class="shrink-0 text-xs text-dimmed">{{ formatRelative(note.updatedAt) }}</span>
            </NuxtLink>
          </div>
          <UEmpty
            v-else
            icon="i-lucide-notebook-pen"
            title="Your notes start here"
            description="Create a page, or let an agent write one through the CLI or MCP server."
            :actions="[
              { label: 'New page', icon: 'i-lucide-plus', onClick: () => void tree.createPage() },
            ]"
          />
        </section>

        <section v-if="tags.length" class="mt-10">
          <h2 class="mb-3 text-xs font-medium tracking-wide text-dimmed uppercase">Tags</h2>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="tag in tags"
              :key="tag.tag"
              @click="openSearch(`tag:${tag.tag} `)"
              :label="tag.tag"
              icon="i-lucide-tag"
              size="sm"
              color="neutral"
              variant="soft"
              class="rounded-full"
            >
              <template #trailing>
                <span class="text-xs text-dimmed">{{ tag.count }}</span>
              </template>
            </UButton>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
