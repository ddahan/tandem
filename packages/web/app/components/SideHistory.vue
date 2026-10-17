<script setup lang="ts">
// Past versions of the note, by day, with their authors: preview, compare with the current
// version, restore.
import { useDebounceFn } from '@vueuse/core'
import { authorLabel, formatDate, formatSize, type HistoryVersion } from '@myfluence/shared'
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
const view = ref<'preview' | 'diff'>('preview')
const comparing = ref(false)

async function open(version: HistoryVersion) {
  try {
    selectedContent.value = (
      await unwrap(api.versions[':id'].$get({ param: { id: version.id } }))
    ).content
    selected.value = version
    view.value = 'preview'
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
  <div>
    <p class="mb-3 px-2 text-xs text-dimmed">
      A version is kept when an editing session ends or another author writes.
    </p>
    <div v-for="[day, list] in days" :key="day" class="mb-4">
      <h3 class="mb-1 px-2 text-xs font-medium text-dimmed">{{ day }}</h3>
      <button
        v-for="version in list"
        :key="version.id"
        type="button"
        class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start hover:bg-elevated"
        data-testid="history-version"
        @click="open(version)"
      >
        <span
          class="size-2 shrink-0 rounded-full"
          :style="{ background: authorColor(version.author) }"
        />
        <span class="text-sm text-default tabular-nums">{{ time(version.createdAt) }}</span>
        <span class="min-w-0 flex-1 truncate text-sm text-muted">{{ label(version.author) }}</span>
        <span class="text-xs text-dimmed">{{ formatSize(version.size) }}</span>
      </button>
    </div>
    <UEmpty
      v-if="!versions.length"
      icon="i-lucide-history"
      title="No versions yet"
      description="They appear 30 seconds after an editing session."
      size="sm"
      variant="naked"
    />

    <UModal
      :open="!!selected"
      :title="
        selected ? `Version of ${formatDate(selected.createdAt)} ${time(selected.createdAt)}` : ''
      "
      :description="selected ? `By ${label(selected.author)}` : ''"
      :ui="{ content: 'max-w-4xl' }"
      @update:open="(open) => !open && (selected = null)"
    >
      <template #body>
        <UTabs
          v-model="view"
          :items="[
            { label: 'Preview', value: 'preview', icon: 'i-lucide-eye' },
            { label: 'Changes since', value: 'diff', icon: 'i-lucide-git-compare' },
          ]"
          :content="false"
          size="sm"
          class="mb-4"
        />
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized by renderMarkdown -->
        <div
          v-if="view === 'preview'"
          class="rendered-markdown max-h-[60vh] overflow-auto"
          v-html="renderMarkdown(selectedContent, notePath)"
        />
        <div v-else class="text-center">
          <UButton
            label="Open the comparison"
            icon="i-lucide-columns-2"
            color="neutral"
            variant="outline"
            @click="comparing = true"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Close" color="neutral" variant="ghost" @click="selected = null" />
          <UButton label="Restore this version" icon="i-lucide-rotate-ccw" @click="restore" />
        </div>
      </template>
    </UModal>

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
