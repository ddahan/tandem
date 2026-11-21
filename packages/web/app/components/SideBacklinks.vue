<script setup lang="ts">
// The Items tab's Page links: notes linking to this one, and notes this one links to, one line
// each (a note's path in its tooltip). Reports how many, once the backlinks are read.
import { useDebounceFn } from '@vueuse/core'
import { linkKey, parseWikiLinks, type Backlink } from '@tandem/shared'

const props = defineProps<{ noteId: string; content: string }>()
const emit = defineEmits<{ count: [count: number] }>()
const api = useApi()
const tree = useTree()

const backlinks = ref<Backlink[] | null>(null)
const load = async () => {
  backlinks.value = await unwrap(
    api.notes[':id'].backlinks.$get({ param: { id: props.noteId } }),
  ).catch(() => [])
}
onMounted(load)
const reload = useDebounceFn(load, 500)
useServerEvents((event) => {
  if (event.type === 'note' || event.type === 'tree' || event.type === 'resync') void reload()
})

const outgoing = computed(() => {
  const pages = tree.nodes.value
  const seen = new Set<string>()
  return parseWikiLinks(props.content)
    .map((link) => {
      const key = linkKey(link.target)
      const node =
        pages.find((n) => linkKey(n.path) === key) ??
        pages
          .filter((n) => linkKey(n.title) === key)
          .toSorted((a, b) => a.path.length - b.path.length)[0]
      return { target: link.target, node }
    })
    .filter((link) => {
      const key = link.node?.id ?? link.target
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
})
watch(
  () => backlinks.value && backlinks.value.length + outgoing.value.length,
  (count) => count !== null && emit('count', count),
  { immediate: true },
)

const row =
  'flex h-7 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-[120ms] hover:bg-accented'
</script>

<template>
  <div v-if="backlinks?.length || outgoing.length" class="space-y-1">
    <section v-if="backlinks?.length">
      <h3 class="px-2 text-xs text-dimmed">Linked from</h3>
      <ULink
        v-for="link in backlinks"
        :key="link.id"
        :to="`/notes/${link.id}`"
        :title="link.path.replace(/\.md$/, '')"
        :class="row"
      >
        <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-dimmed" />
        <span class="truncate text-default">{{ link.title }}</span>
      </ULink>
    </section>
    <section v-if="outgoing.length">
      <h3 class="px-2 text-xs text-dimmed">Links to</h3>
      <template v-for="link in outgoing" :key="link.target">
        <ULink
          v-if="link.node"
          :to="`/notes/${link.node.id}`"
          :title="link.node.path.replace(/\.md$/, '')"
          :class="row"
        >
          <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-dimmed" />
          <span class="truncate text-default">{{ link.node.title }}</span>
        </ULink>
        <span v-else class="flex h-7 items-center gap-2 px-2 text-sm text-dimmed">
          <UIcon name="i-lucide-file-question" class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ link.target }}</span>
          <span class="shrink-0 text-xs">missing</span>
        </span>
      </template>
    </section>
  </div>
</template>
