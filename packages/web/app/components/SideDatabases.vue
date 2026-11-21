<script setup lang="ts">
// The databases the note shows (its `database` blocks, in order), with their row counts, in the
// Items tab's Databases: a click scrolls to one. Inserted with the slash menu (/database).
// Reports how many.
import { databaseIdsIn, type DatabaseSummary } from '@tandem/shared'

const props = defineProps<{ noteId: string; content: string }>()
const emit = defineEmits<{ go: [id: string]; count: [count: number] }>()
const api = useApi()

const summaries = ref<DatabaseSummary[]>([])
const load = async () => {
  summaries.value = await unwrap(
    api.notes[':id'].databases.$get({ param: { id: props.noteId } }),
  ).catch(() => [])
}
onMounted(load)
useServerEvents((event) => {
  if (event.type === 'database' || event.type === 'resync') void load()
})

const ids = computed(() => databaseIdsIn(props.content))
// A block just inserted (or pasted from another note) may not be listed yet: load again.
watch(ids, (next, previous) => {
  if (next.join() !== previous?.join()) void load()
})

const shown = computed(() =>
  ids.value.map((id) => {
    const summary = summaries.value.find((s) => s.id === id)
    return { id, title: summary?.title, rowCount: summary?.rowCount }
  }),
)
watch(
  () => shown.value.length,
  (count) => emit('count', count),
  { immediate: true },
)
</script>

<template>
  <ul v-if="shown.length" class="space-y-0.5">
    <li v-for="(database, index) in shown" :key="`${database.id}-${index}`">
      <button
        type="button"
        class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-start transition-colors duration-[120ms] hover:bg-accented"
        @click="emit('go', database.id)"
      >
        <UIcon name="i-lucide-database" class="size-4 shrink-0 text-dimmed" />
        <span class="min-w-0 flex-1 truncate text-sm text-default">
          {{ database.title || 'Untitled database' }}
        </span>
        <span v-if="database.rowCount !== undefined" class="shrink-0 text-xs text-dimmed">
          {{ database.rowCount }} row{{ database.rowCount === 1 ? '' : 's' }}
        </span>
      </button>
    </li>
  </ul>
</template>
