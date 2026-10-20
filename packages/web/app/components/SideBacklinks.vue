<script setup lang="ts">
// Notes linking to this one, and notes this one links to.
import { useDebounceFn } from '@vueuse/core'
import { linkKey, parseWikiLinks, type Backlink } from '@tandem/shared'

const props = defineProps<{ noteId: string; content: string }>()
const api = useApi()
const tree = useTree()

const backlinks = ref<Backlink[]>([])
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
</script>

<template>
  <UEmpty
    v-if="!backlinks.length && !outgoing.length"
    icon="i-lucide-link-2"
    title="No links"
    description="Notes linking here and notes linked from this one appear here. Type [[ to link one."
    size="sm"
    variant="naked"
  />
  <div v-else class="space-y-5">
    <section>
      <h3 class="mb-1.5 px-2 text-xs font-medium tracking-wide text-dimmed uppercase">
        Linked from
      </h3>
      <ULink
        v-for="link in backlinks"
        :key="link.id"
        :to="`/notes/${link.id}`"
        class="flex flex-col rounded-md px-2 py-1.5 hover:bg-elevated"
      >
        <span class="text-sm font-medium text-default">{{ link.title }}</span>
        <span class="truncate text-xs text-dimmed">{{ link.path.replace(/\.md$/, '') }}</span>
      </ULink>
      <p v-if="!backlinks.length" class="px-2 text-sm text-dimmed">No note links here yet.</p>
    </section>
    <section>
      <h3 class="mb-1.5 px-2 text-xs font-medium tracking-wide text-dimmed uppercase">Links to</h3>
      <template v-for="link in outgoing" :key="link.target">
        <ULink
          v-if="link.node"
          :to="`/notes/${link.node.id}`"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-elevated"
        >
          <UIcon name="i-lucide-file-text" class="size-4 text-dimmed" />
          {{ link.node.title }}
        </ULink>
        <span v-else class="flex items-center gap-2 px-2 py-1.5 text-sm text-dimmed">
          <UIcon name="i-lucide-file-question" class="size-4" />
          {{ link.target }} <UBadge label="missing" size="sm" variant="subtle" color="neutral" />
        </span>
      </template>
      <p v-if="!outgoing.length" class="px-2 text-sm text-dimmed">
        Type <UKbd>[[</UKbd> in the note to link another one.
      </p>
    </section>
  </div>
</template>
