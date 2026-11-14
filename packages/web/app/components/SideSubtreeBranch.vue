<script setup lang="ts">
// A sub-page in SideSubtree's Tree, drawn as in the sidebar's tree: a chevron to fold it, its
// icon and title (a click opens it), how many items it and its pages hold, then (unfolded) its
// own items and its sub-pages holding any, indented under a guide line. Recursive.
import type { SubtreePage } from '@tandem/shared'
import type { SubtreeItem } from '~/utils/subtree-items'

export interface SubtreeBranch {
  page: SubtreePage
  items: SubtreeItem[]
  children: SubtreeBranch[]
  /** Its items and its sub-pages'. */
  count: number
}

const props = defineProps<{ branch: SubtreeBranch; folded: string[] }>()
const emit = defineEmits<{ toggle: [id: string] }>()

const tabs = useTabs()
const tree = useTree()

const node = computed(() => tree.byId.value.get(props.branch.page.id))
const open = computed(() => !props.folded.includes(props.branch.page.id))
</script>

<template>
  <section :data-testid="`side-group-${branch.page.title}`">
    <div
      class="flex h-7 items-center gap-1 rounded-md ps-1 pe-2 text-sm text-default hover:bg-elevated/60"
    >
      <button
        type="button"
        class="grid size-5 shrink-0 place-items-center rounded text-dimmed hover:text-default"
        :aria-expanded="open"
        :aria-label="`${open ? 'Fold' : 'Unfold'} ${branch.page.title}`"
        data-testid="side-group-toggle"
        @click="emit('toggle', branch.page.id)"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5 transition-transform"
          :class="open && 'rotate-90'"
        />
      </button>
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1.5 text-start"
        @click="tabs.open(`/notes/${branch.page.id}`)"
      >
        <NodeIcon :icon="node?.icon ?? null" :kind="node ? tree.kindOf(node) : branch.page.kind" />
        <span class="truncate">{{ branch.page.title }}</span>
      </button>
      <span class="shrink-0 text-xs text-dimmed tabular-nums" data-testid="side-group-count">
        {{ branch.count }}
      </span>
    </div>
    <div v-if="open" class="ms-3 space-y-0.5 border-s border-default ps-1">
      <ul v-if="branch.items.length" class="space-y-0.5">
        <li v-for="item in branch.items" :key="item.key">
          <SideSubtreeRow :item="item" />
        </li>
      </ul>
      <SideSubtreeBranch
        v-for="child in branch.children"
        :key="child.page.id"
        :branch="child"
        :folded="folded"
        @toggle="emit('toggle', $event)"
      />
    </div>
  </section>
</template>
