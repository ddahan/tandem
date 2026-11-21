<script setup lang="ts">
// The websites the note points to, in the Items tab's Bookmarks: its bookmark cards (in order;
// "Used 3 times" when other notes show one too), then the links to websites in its text
// (`[text](https://…)`, bare addresses), one line each. A click scrolls to one in the note, a
// double click opens its website. Read from the note's Markdown; reports how many.
import { bookmarkIdsIn, externalLinksIn, siteOf, urlKey } from '@tandem/shared'
import { openWebsite, usesLabel } from '~/composables/useBookmarks'

const props = defineProps<{ content: string }>()
const emit = defineEmits<{ count: [count: number] }>()
const bookmarks = useBookmarks()
const tabs = useTabs()

const cards = computed(() =>
  [...new Set(bookmarkIdsIn(props.content))].map((id) => ({
    id,
    bookmark: bookmarks.byId.value.get(id) ?? null,
  })),
)

// A link's bookmark, when the page is bookmarked: its favicon, and a way to its page.
const byKey = computed(
  () => new Map(bookmarks.list.value.map((bookmark) => [urlKey(bookmark.url), bookmark])),
)
const links = computed(() =>
  externalLinksIn(props.content).map(({ text, url }) => ({
    text,
    url,
    bookmark: byKey.value.get(urlKey(url)) ?? null,
  })),
)
watch(
  () => cards.value.length + links.value.length,
  (count) => emit('count', count),
  { immediate: true },
)

function scrollTo(selector: string) {
  document
    .querySelector(`.note-editor ${selector}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
const toCard = (id: string) => scrollTo(`[data-bookmark-id="${CSS.escape(id)}"]`)
const toLink = (url: string) => scrollTo(`a[href="${CSS.escape(url)}"]`)
</script>

<template>
  <ul v-if="cards.length || links.length" class="space-y-0.5" data-testid="side-bookmarks">
    <li v-for="card in cards" :key="card.id">
      <div
        role="button"
        tabindex="0"
        class="group relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-start transition-colors duration-[120ms] hover:bg-accented"
        :title="card.bookmark?.url"
        :data-testid="`side-bookmark-${card.bookmark?.title ?? card.id}`"
        @click="toCard(card.id)"
        @keydown.enter="card.bookmark && openWebsite(card.bookmark.url)"
        @dblclick="card.bookmark && openWebsite(card.bookmark.url)"
      >
        <BookmarkIcon :bookmark="card.bookmark" size="md" />
        <span class="min-w-0 flex-1 truncate text-sm text-default">
          {{ card.bookmark?.title ?? 'Deleted bookmark' }}
        </span>
        <span
          v-if="card.bookmark"
          class="max-w-2/5 shrink-0 truncate text-xs text-dimmed group-hover:opacity-0 group-has-focus-visible:opacity-0"
        >
          {{ [siteOf(card.bookmark.url), usesLabel(card.bookmark)].filter(Boolean).join(' · ') }}
        </span>
        <!-- On hover (or focus), in the site's place. -->
        <UTooltip v-if="card.bookmark" text="Show the bookmark">
          <UButton
            icon="i-lucide-arrow-up-right"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Show the bookmark"
            class="absolute end-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            @click.stop="tabs.open(`/bookmarks/${card.id}`)"
          />
        </UTooltip>
      </div>
    </li>
    <li v-for="link in links" :key="link.url">
      <div
        role="button"
        tabindex="0"
        class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-start transition-colors duration-[120ms] hover:bg-accented"
        :title="link.url"
        :data-testid="`side-link-${link.text}`"
        @click="toLink(link.url)"
        @keydown.enter="openWebsite(link.url)"
        @dblclick="openWebsite(link.url)"
      >
        <BookmarkIcon :bookmark="link.bookmark" size="md" />
        <span class="min-w-0 flex-1 truncate text-sm text-default">{{ link.text }}</span>
        <span class="max-w-2/5 shrink-0 truncate text-xs text-dimmed">{{ siteOf(link.url) }}</span>
      </div>
    </li>
  </ul>
</template>
