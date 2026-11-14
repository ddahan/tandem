<script setup lang="ts">
// The websites the note points to: its bookmark cards (in order; "Used 3 times" when other notes
// show one too), then the links to websites in its text (`[text](https://…)`, bare addresses).
// A click scrolls to one in the note, a double click opens its website. Read from the note's
// Markdown, only while this tab shows.
import { bookmarkIdsIn, externalLinksIn, siteOf, urlKey } from '@tandem/shared'
import { openWebsite, usesLabel } from '~/composables/useBookmarks'

const props = defineProps<{ content: string }>()
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

function scrollTo(selector: string) {
  document
    .querySelector(`.note-editor ${selector}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
const toCard = (id: string) => scrollTo(`[data-bookmark-id="${CSS.escape(id)}"]`)
const toLink = (url: string) => scrollTo(`a[href="${CSS.escape(url)}"]`)
</script>

<template>
  <UEmpty
    v-if="!cards.length && !links.length"
    icon="i-lucide-bookmark"
    title="No websites"
    description="Bookmarks and links to websites in the note appear here. Type /bookmark in the note to add a bookmark’s card."
    size="sm"
    variant="naked"
  />
  <div v-else class="flex flex-col gap-4" data-testid="side-bookmarks">
    <section v-if="cards.length">
      <h3 class="mb-1 px-2 text-xs font-medium text-muted">Bookmarks</h3>
      <ul class="space-y-0.5">
        <li v-for="card in cards" :key="card.id">
          <div
            role="button"
            tabindex="0"
            class="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start transition-colors duration-[120ms] hover:bg-accented"
            :title="card.bookmark?.url"
            :data-testid="`side-bookmark-${card.bookmark?.title ?? card.id}`"
            @click="toCard(card.id)"
            @keydown.enter="card.bookmark && openWebsite(card.bookmark.url)"
            @dblclick="card.bookmark && openWebsite(card.bookmark.url)"
          >
            <BookmarkIcon :bookmark="card.bookmark" size="md" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-default">
                {{ card.bookmark?.title ?? 'Deleted bookmark' }}
              </span>
              <span v-if="card.bookmark" class="block truncate text-xs text-dimmed">
                {{ siteOf(card.bookmark.url) }}
                <template v-if="usesLabel(card.bookmark)">
                  · {{ usesLabel(card.bookmark) }}</template
                >
              </span>
            </span>
            <UTooltip v-if="card.bookmark" text="Show the bookmark">
              <UButton
                icon="i-lucide-arrow-up-right"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Show the bookmark"
                class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                @click.stop="tabs.open(`/bookmarks/${card.id}`)"
              />
            </UTooltip>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="links.length">
      <h3 class="mb-1 px-2 text-xs font-medium text-muted">Links</h3>
      <ul class="space-y-0.5">
        <li v-for="link in links" :key="link.url">
          <div
            role="button"
            tabindex="0"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start transition-colors duration-[120ms] hover:bg-accented"
            :title="link.url"
            :data-testid="`side-link-${link.text}`"
            @click="toLink(link.url)"
            @keydown.enter="openWebsite(link.url)"
            @dblclick="openWebsite(link.url)"
          >
            <BookmarkIcon :bookmark="link.bookmark" size="md" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-default">{{ link.text }}</span>
              <span class="block truncate text-xs text-dimmed">{{ siteOf(link.url) }}</span>
            </span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
