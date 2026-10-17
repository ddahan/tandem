<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { formatRelative, type SearchResponse } from '@myfluence/shared'

const route = useRoute()
const router = useRouter()
const api = useApi()
const tree = useTree()

const query = ref(String(route.query.q ?? ''))
const debounced = refDebounced(query, 150)
const response = ref<SearchResponse | null>(null)
const loading = ref(false)
const input = useTemplateRef<{ inputRef: HTMLInputElement }>('input')

watch(
  debounced,
  async (q) => {
    void router.replace({ query: q ? { q } : {} })
    loading.value = true
    try {
      response.value = await unwrap(api.search.$get({ query: { q, limit: '50' } }))
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

onMounted(() => input.value?.inputRef.focus())
useHead({ title: 'Search · Myfluence' })

const hints = [
  { example: 'roadmap', text: 'words, as prefixes, accents ignored' },
  { example: '"exact phrase"', text: 'an exact phrase' },
  { example: '-draft', text: 'exclude a word' },
  { example: 'tag:work', text: 'notes with a tag' },
  { example: 'in:Projects', text: 'notes in a folder' },
]
</script>

<template>
  <UDashboardPanel id="search">
    <template #header>
      <UDashboardNavbar title="Search" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl py-4">
        <UInput
          ref="input"
          v-model="query"
          icon="i-lucide-search"
          size="xl"
          placeholder="Search titles, text and attachment names…"
          :loading="loading"
          class="w-full"
          data-testid="search-input"
        />
        <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dimmed">
          <button
            v-for="hint in hints"
            :key="hint.example"
            type="button"
            class="hover:text-default"
            @click="query = `${query} ${hint.example}`.trim()"
          >
            <code class="text-muted">{{ hint.example }}</code> {{ hint.text }}
          </button>
        </div>

        <p v-if="response?.correctedQuery" class="mt-6 text-sm text-muted">
          Showing results for
          <button
            type="button"
            class="font-medium text-primary"
            @click="query = response.correctedQuery!"
          >
            {{ response.correctedQuery }}
          </button>
        </p>

        <ul class="mt-6 space-y-2">
          <li v-for="result in response?.results ?? []" :key="result.id">
            <NuxtLink
              :to="`/notes/${result.id}`"
              class="block rounded-lg border border-default px-4 py-3 transition-colors hover:bg-elevated/60"
              data-testid="search-result"
            >
              <div class="flex items-center gap-2">
                <span class="font-medium text-highlighted">{{ result.title }}</span>
                <span class="truncate text-xs text-dimmed">{{
                  tree
                    .ancestors(result.id)
                    .slice(0, -1)
                    .map((n) => n.title)
                    .join(' / ')
                }}</span>
                <span class="ms-auto shrink-0 text-xs text-dimmed">{{
                  formatRelative(result.updatedAt)
                }}</span>
              </div>
              <!-- eslint-disable-next-line vue/no-v-html -- escaped by the server, only <mark> added -->
              <p
                v-if="result.snippet"
                class="search-snippet mt-1 line-clamp-2 text-sm text-muted"
                v-html="result.snippet"
              />
              <div
                v-if="result.attachments.length || result.tags.length"
                class="mt-2 flex flex-wrap gap-1.5"
              >
                <UBadge
                  v-for="name in result.attachments"
                  :key="name"
                  :label="name"
                  icon="i-lucide-paperclip"
                  size="sm"
                  variant="soft"
                  color="primary"
                />
                <UBadge
                  v-for="tag in result.tags"
                  :key="tag"
                  :label="tag"
                  icon="i-lucide-tag"
                  size="sm"
                  variant="soft"
                  color="neutral"
                />
              </div>
            </NuxtLink>
          </li>
        </ul>
        <UEmpty
          v-if="response && !response.results.length && query.trim()"
          icon="i-lucide-search-x"
          title="No results"
          description="Try fewer words, or check the filters."
          class="mt-10"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
