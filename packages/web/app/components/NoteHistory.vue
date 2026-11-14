<script setup lang="ts">
// The note's History view (a mode of the note page, next to Authorship): its past versions, by
// day, with their authors, and the one picked beside them (rendered), to compare with the
// current version or restore. Restoring goes back to the editor.
import { useDebounceFn } from '@vueuse/core'
import { authorLabel, formatDate, formatSize, type HistoryVersion } from '@tandem/shared'
import { authorColor } from '~/utils/authorship'
import { renderMarkdown } from '~/utils/render-markdown'

const props = defineProps<{ noteId: string; notePath: string; content: string }>()
const emit = defineEmits<{ restored: [content: string] }>()
const api = useApi()
const toast = useToast()
const showError = useApiErrorToast()
const { settings } = useSettings()

const versions = ref<HistoryVersion[]>([])
const load = async () => {
  versions.value = await unwrap(
    api.notes[':id'].history.$get({ param: { id: props.noteId } }),
  ).catch(() => [])
}
onMounted(load)
const reload = useDebounceFn(load, 1000)
useServerEvents((event) => {
  if ((event.type === 'note' && event.id === props.noteId) || event.type === 'resync') void reload()
})
// Sessions end 30 s after the last save: refresh then.
const timer = setInterval(() => void load(), 20_000)
onBeforeUnmount(() => clearInterval(timer))

const days = computed(() => {
  const groups = new Map<string, HistoryVersion[]>()
  for (const version of versions.value) {
    const day = formatDate(version.createdAt)
    groups.set(day, [...(groups.get(day) ?? []), version])
  }
  return [...groups]
})

const selected = ref<HistoryVersion | null>(null)
const selectedContent = ref('')
const comparing = ref(false)

async function open(version: HistoryVersion) {
  try {
    selectedContent.value = (
      await unwrap(api.versions[':id'].$get({ param: { id: version.id } }))
    ).content
    selected.value = version
  } catch (error) {
    showError(error)
  }
}

async function restore() {
  if (!selected.value) return
  try {
    await unwrap(
      api.notes[':id'].restore.$post({
        param: { id: props.noteId },
        json: { versionId: selected.value.id },
      }),
    )
    emit('restored', selectedContent.value)
    toast.add({
      title: 'Version restored',
      description: 'The previous content is kept in the history.',
      icon: 'i-lucide-history',
    })
    selected.value = null
    await load()
  } catch (error) {
    showError(error, 'Could not restore')
  }
}

const label = (author: string) => authorLabel(author, settings.value.displayName)
const time = (ms: number) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(ms)
</script>

<template>
  <UEmpty
    v-if="!versions.length"
    icon="i-lucide-history"
    title="No versions yet"
    description="A version is kept when an editing session ends (30 seconds without saves) or another author writes."
    variant="naked"
  />
  <div v-else class="flex flex-col gap-6 md:flex-row" data-testid="note-history">
    <nav aria-label="Versions" class="shrink-0 md:w-60">
      <div v-for="[day, list] in days" :key="day" class="mb-4">
        <h3 class="mb-1 px-2 text-xs font-medium text-dimmed">{{ day }}</h3>
        <button
          v-for="version in list"
          :key="version.id"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start"
          :class="selected?.id === version.id ? 'bg-elevated' : 'hover:bg-elevated/60'"
          :aria-current="selected?.id === version.id || undefined"
          data-testid="history-version"
          @click="open(version)"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{ background: authorColor(version.author) }"
          />
          <span class="text-sm text-default tabular-nums">{{ time(version.createdAt) }}</span>
          <span class="min-w-0 flex-1 truncate text-sm text-muted">{{
            label(version.author)
          }}</span>
          <span class="text-xs text-dimmed">{{ formatSize(version.size) }}</span>
        </button>
      </div>
      <p class="px-2 text-xs text-dimmed">
        A version is kept when an editing session ends or another author writes.
      </p>
    </nav>

    <section class="min-w-0 flex-1" aria-label="The version picked">
      <p v-if="!selected" class="py-8 text-center text-sm text-muted">
        Pick a version to see it, compare it with the current one, or restore it.
      </p>
      <template v-else>
        <div class="mb-4 flex flex-wrap items-center gap-2 border-b border-default pb-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-highlighted">
              {{ formatDate(selected.createdAt) }} {{ time(selected.createdAt) }}
            </p>
            <p class="text-xs text-muted">By {{ label(selected.author) }}</p>
          </div>
          <UButton
            label="Compare with current"
            icon="i-lucide-columns-2"
            color="neutral"
            variant="outline"
            size="sm"
            @click="comparing = true"
          />
          <UButton
            label="Restore this version"
            icon="i-lucide-rotate-ccw"
            size="sm"
            @click="restore"
          />
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized by renderMarkdown -->
        <div class="rendered-markdown" v-html="renderMarkdown(selectedContent, notePath)" />
      </template>
    </section>

    <DiffModal
      v-model:open="comparing"
      title="Changes since this version"
      :before="selectedContent"
      :after="content"
      before-label="This version"
      after-label="Current"
    />
  </div>
</template>
