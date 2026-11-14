<script setup lang="ts">
// A side panel tab (Links, Bookmarks, Files, Databases) on a page with sub-pages: what they hold
// too, shown two ways (remembered). Tree: this page's tab as usual (the slot), then its sub-pages
// as in the sidebar's tree, nested and foldable (remembered), those holding none, nor any of
// their pages, left out. Flat: everything in
// one list, each item naming its page, sorted by name, page, or what the kind has (size and
// type for files, site for bookmarks, rows for databases). Without sub-pages (`items` null), or
// with nothing of this kind in the page or under it (no choice to make),
// only the slot. The items come from `GET /notes/:id/subtree`, read by NoteSidePanel only while
// such a tab shows.
import { formatSize, siteOf, type SubtreeItems, type SubtreePage } from '@tandem/shared'
import { useLocalStorage } from '@vueuse/core'
import { openWebsite, usesLabel } from '~/composables/useBookmarks'
import { fileIconSvg } from '~/utils/file-icons'
import { sortSubtreeItems, type SubtreeItem, type SubtreeSort } from '~/utils/subtree-items'
import type { SubtreeBranch } from './SideSubtreeBranch.vue'

export type SubtreeKind = 'links' | 'bookmarks' | 'files' | 'databases'

const props = defineProps<{ kind: SubtreeKind; items: SubtreeItems | null }>()

const bookmarks = useBookmarks()
const tabs = useTabs()

const display = useLocalStorage<'tree' | 'flat'>('tandem-side-display', 'tree')

type Sort = SubtreeSort
const SORTS: Record<SubtreeKind, { value: Sort; label: string }[]> = {
  links: [],
  bookmarks: [{ value: 'site', label: 'Site' }],
  files: [
    { value: 'size', label: 'Size' },
    { value: 'type', label: 'Type' },
  ],
  databases: [{ value: 'rows', label: 'Rows' }],
}
const sortItems = computed(() => [
  { value: 'page' as Sort, label: 'Page' },
  { value: 'name' as Sort, label: 'Name' },
  ...SORTS[props.kind],
])
const sorts = useLocalStorage<Record<string, Sort>>('tandem-side-sort', {})
const sort = computed({
  get: () => {
    const value = sorts.value[props.kind] ?? 'page'
    return sortItems.value.some((item) => item.value === value) ? value : 'page'
  },
  set: (value: Sort) => (sorts.value = { ...sorts.value, [props.kind]: value }),
})

const fileUrl = (path: string) => `/files/${path.split('/').map(encodeURIComponent).join('/')}`

function itemsOf(page: SubtreePage, index: number): SubtreeItem[] {
  const at = (i: number) => index * 10_000 + i
  if (props.kind === 'links') {
    return page.wikiLinks.map((link, i) => ({
      key: `${page.id}:${link.target}`,
      page,
      order: at(i),
      label: link.title,
      detail: link.id ? '' : 'missing',
      icon: link.id ? 'i-lucide-file-text' : 'i-lucide-file-question',
      missing: !link.id,
      open: () => link.id && void tabs.open(`/notes/${link.id}`),
    }))
  }
  if (props.kind === 'bookmarks') {
    const cards = page.bookmarkIds.map((id, i): SubtreeItem => {
      const bookmark = bookmarks.byId.value.get(id) ?? null
      return {
        key: `${page.id}:card:${id}`,
        page,
        order: at(i),
        label: bookmark?.title ?? 'Deleted bookmark',
        detail: bookmark
          ? [siteOf(bookmark.url), usesLabel(bookmark)].filter(Boolean).join(' · ')
          : '',
        bookmark,
        site: bookmark ? siteOf(bookmark.url) : '',
        open: () => void tabs.open(`/bookmarks/${id}`),
        activate: () => bookmark && openWebsite(bookmark.url),
      }
    })
    const links = page.links.map((link, i): SubtreeItem => ({
      key: `${page.id}:link:${link.url}`,
      page,
      order: at(cards.length + i),
      label: link.text,
      detail: siteOf(link.url),
      bookmark: null,
      site: siteOf(link.url),
      open: () => openWebsite(link.url),
    }))
    return [...cards, ...links]
  }
  if (props.kind === 'files') {
    return page.attachments.map((file, i) => ({
      key: file.path,
      page,
      order: at(i),
      label: file.name,
      detail: formatSize(file.size),
      fileSvg: fileIconSvg(file.name),
      size: file.size,
      type: file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '',
      open: () => window.open(fileUrl(file.path), '_blank', 'noopener'),
    }))
  }
  return page.databases.map((database, i) => ({
    key: database.id,
    page,
    order: at(i),
    label: database.title || 'Untitled database',
    detail: `${database.rowCount} row${database.rowCount === 1 ? '' : 's'}`,
    icon: 'i-lucide-database',
    rows: database.rowCount,
    open: () => void tabs.open(`/notes/${page.id}`),
  }))
}

const all = computed(() => (props.items?.pages ?? []).flatMap((page, i) => itemsOf(page, i)))

/** The branches holding items, themselves or in their pages, each with its count. */
function prune(list: SubtreeBranch[]): SubtreeBranch[] {
  return list.flatMap((branch) => {
    const children = prune(branch.children)
    const count = branch.items.length + children.reduce((sum, child) => sum + child.count, 0)
    return count ? [{ ...branch, children, count }] : []
  })
}

/**
 * Tree: the sub-pages nested as in the pages' tree (they come depth first, each with its depth),
 * those holding none, nor any of their pages, left out.
 */
const branches = computed(() => {
  const pages = props.items?.pages ?? []
  const roots: SubtreeBranch[] = []
  const stack: SubtreeBranch[] = []
  for (const page of pages.slice(1)) {
    const branch: SubtreeBranch = {
      page,
      items: all.value.filter((item) => item.page.id === page.id),
      children: [],
      count: 0,
    }
    while (stack.length && stack.at(-1)!.page.depth >= page.depth) stack.pop()
    ;(stack.at(-1)?.children ?? roots).push(branch)
    stack.push(branch)
  }
  return prune(roots)
})

/** The sub-pages folded in Tree, for every page and tab. */
const folded = useLocalStorage<string[]>('tandem-side-folded', [])
function toggle(id: string) {
  folded.value = folded.value.includes(id)
    ? folded.value.filter((other) => other !== id)
    : [...folded.value, id]
}

/**
 * In Tree, the page itself holding none of a kind whose tab has nothing else to offer
 * (bookmarks, databases): one line instead of its empty state, so the sub-pages come first.
 */
const ownEmpty = computed(
  () =>
    (props.kind === 'bookmarks' || props.kind === 'databases') &&
    !!props.items &&
    !all.value.some((item) => item.page.depth === 0),
)

const flat = computed(() => sortSubtreeItems(all.value, sort.value))

const displays = [
  { value: 'tree', label: 'Tree', icon: 'i-lucide-list-tree' },
  { value: 'flat', label: 'Flat', icon: 'i-lucide-list' },
] as const
</script>

<template>
  <slot v-if="!items || !all.length" />
  <div v-else class="flex flex-col gap-3" data-testid="side-subtree">
    <div class="flex items-center gap-2">
      <div role="radiogroup" aria-label="Display" class="flex gap-0.5" data-testid="side-display">
        <UButton
          v-for="option in displays"
          :key="option.value"
          role="radio"
          :aria-checked="display === option.value"
          :label="option.label"
          :icon="option.icon"
          size="xs"
          color="neutral"
          :variant="display === option.value ? 'soft' : 'ghost'"
          @click="display = option.value"
        />
      </div>
      <USelect
        v-if="display === 'flat'"
        v-model="sort"
        :items="sortItems"
        value-key="value"
        size="xs"
        variant="ghost"
        aria-label="Sort by"
        class="ms-auto"
        data-testid="side-sort"
      >
        <template #leading
          ><UIcon name="i-lucide-arrow-down-wide-narrow" class="size-3.5"
        /></template>
      </USelect>
    </div>

    <template v-if="display === 'tree'">
      <p v-if="ownEmpty" class="px-2 text-sm text-dimmed" data-testid="side-own-empty">
        None in this page itself.
      </p>
      <slot v-else />
      <div v-if="branches.length" class="space-y-0.5">
        <SideSubtreeBranch
          v-for="branch in branches"
          :key="branch.page.id"
          :branch="branch"
          :folded="folded"
          @toggle="toggle"
        />
      </div>
    </template>

    <template v-else>
      <ul class="space-y-0.5" data-testid="side-flat">
        <li v-for="item in flat" :key="item.key">
          <SideSubtreeRow :item="item" show-page />
        </li>
      </ul>
    </template>

    <p v-if="items.truncated" class="px-2 text-xs text-dimmed">
      Only the first 500 pages under this one are read.
    </p>
  </div>
</template>
