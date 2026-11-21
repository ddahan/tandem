<script setup lang="ts">
// A section of the side panel's Items tab (Files, Bookmarks, Databases, Page links): a header
// (fold it, remembered; how many it holds, the page's and its sub-pages'; the flat display's
// sort; the kind's own buttons, `actions`), then its items. The page's own come from the
// default slot (SideAttachments…, which report how many with `own`); on a page with sub-pages
// (`items` from `GET /notes/:id/subtree`, read by NoteSidePanel), theirs follow, shown as
// SideItems' switch says. Tree: the page's own, then its sub-pages as in the sidebar's tree,
// nested and foldable (remembered), those holding none, nor any of their pages, left out.
// Flat: everything in one list, each item naming its page, sorted by name, page, or what the
// kind has (size and type for files, site for bookmarks, rows for databases). Empty, the
// `empty` slot: one line on how to add one.
import { formatSize, siteOf, type SubtreeItems, type SubtreePage } from '@tandem/shared'
import { useLocalStorage } from '@vueuse/core'
import { openWebsite, usesLabel } from '~/composables/useBookmarks'
import { fileIconSvg } from '~/utils/file-icons'
import { sortSubtreeItems, type SubtreeItem, type SubtreeSort } from '~/utils/subtree-items'
import type { SubtreeBranch } from './SideSubtreeBranch.vue'

export type SubtreeKind = 'links' | 'bookmarks' | 'files' | 'databases'

const props = defineProps<{
  kind: SubtreeKind
  items: SubtreeItems | null
  display: 'tree' | 'flat'
  /**
   * How many the page itself holds: undefined until known, and while its sub-pages' are read
   * (no count, no empty line yet).
   */
  own: number | undefined
}>()

const bookmarks = useBookmarks()
const tabs = useTabs()

const SECTIONS: Record<SubtreeKind, { title: string; icon: string }> = {
  files: { title: 'Files', icon: 'i-lucide-paperclip' },
  bookmarks: { title: 'Bookmarks', icon: 'i-lucide-bookmark' },
  databases: { title: 'Databases', icon: 'i-lucide-database' },
  links: { title: 'Page links', icon: 'i-lucide-link-2' },
}
const section = computed(() => SECTIONS[props.kind])

/** The sections folded, for every page. */
const foldedSections = useLocalStorage<string[]>('tandem-side-sections-folded', [])
const open = computed(() => !foldedSections.value.includes(props.kind))
function toggleSection() {
  foldedSections.value = open.value
    ? [...foldedSections.value, props.kind]
    : foldedSections.value.filter((kind) => kind !== props.kind)
}

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
/** Its sub-pages' items alone (the page's own come from the slot). */
const below = computed(() => all.value.filter((item) => item.page.depth > 0).length)
const count = computed(() => (props.own === undefined ? undefined : props.own + below.value))
const flatShown = computed(() => props.display === 'flat' && below.value > 0)

/** The branches holding items, themselves or in their pages, each with its count. */
function prune(list: SubtreeBranch[]): SubtreeBranch[] {
  return list.flatMap((branch) => {
    const children = prune(branch.children)
    const total = branch.items.length + children.reduce((sum, child) => sum + child.count, 0)
    return total ? [{ ...branch, children, count: total }] : []
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

/** The sub-pages folded in Tree, for every page and section. */
const folded = useLocalStorage<string[]>('tandem-side-folded', [])
function toggle(id: string) {
  folded.value = folded.value.includes(id)
    ? folded.value.filter((other) => other !== id)
    : [...folded.value, id]
}

const flat = computed(() => sortSubtreeItems(all.value, sort.value))
</script>

<template>
  <section :data-testid="`side-section-${kind}`">
    <div class="flex h-7 items-center gap-1 ps-1 pe-0.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 text-start text-xs font-medium text-muted hover:text-default"
        :aria-expanded="open"
        :aria-label="`${open ? 'Fold' : 'Unfold'} ${section.title}`"
        data-testid="side-section-toggle"
        @click="toggleSection"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5 shrink-0 text-dimmed transition-transform"
          :class="open && 'rotate-90'"
        />
        <UIcon :name="section.icon" class="size-3.5 shrink-0" />
        <span class="truncate">{{ section.title }}</span>
        <span
          v-if="count !== undefined"
          class="text-dimmed tabular-nums"
          data-testid="side-section-count"
          >{{ count }}</span
        >
      </button>
      <USelect
        v-if="open && flatShown"
        v-model="sort"
        :items="sortItems"
        value-key="value"
        size="xs"
        variant="ghost"
        :aria-label="`Sort ${section.title} by`"
        data-testid="side-sort"
      >
        <template #leading
          ><UIcon name="i-lucide-arrow-down-wide-narrow" class="size-3.5"
        /></template>
      </USelect>
      <slot name="actions" />
    </div>

    <div v-show="open">
      <!-- Kept in Flat (hidden): the page's own lists load once, and keep their count. -->
      <div v-show="!flatShown">
        <slot />
        <div v-if="branches.length && !flatShown" class="space-y-0.5">
          <SideSubtreeBranch
            v-for="branch in branches"
            :key="branch.page.id"
            :branch="branch"
            :folded="folded"
            @toggle="toggle"
          />
        </div>
      </div>
      <ul v-if="flatShown" class="space-y-0.5" data-testid="side-flat">
        <li v-for="item in flat" :key="item.key">
          <SideSubtreeRow :item="item" show-page />
        </li>
      </ul>
      <p
        v-if="count === 0"
        class="px-2 py-1 text-xs text-dimmed"
        :data-testid="`side-empty-${kind}`"
      >
        <slot name="empty" />
      </p>
    </div>
  </section>
</template>
