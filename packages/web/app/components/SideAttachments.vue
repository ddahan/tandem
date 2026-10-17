<script setup lang="ts">
// Files attached to the note (its `.assets` folder): open them, add more.
import { formatSize, type Attachment } from '@tandem/shared'
import { fileIconSvg } from '~/utils/file-icons'

const props = defineProps<{ noteId: string; notePath: string }>()
const emit = defineEmits<{ insert: [markdown: string] }>()
const api = useApi()
const showError = useApiErrorToast()
const confirm = useConfirm()

const attachments = ref<Attachment[]>([])
const load = async () => {
  attachments.value = await unwrap(
    api.notes[':id'].attachments.$get({ param: { id: props.noteId } }),
  ).catch(() => [])
}
onMounted(load)
useServerEvents((event) => {
  if ((event.type === 'note' && event.id === props.noteId) || event.type === 'resync') void load()
})

const url = (attachment: Attachment) =>
  `/files/${attachment.path.split('/').map(encodeURIComponent).join('/')}`
const markdownOf = (a: Attachment) =>
  a.isImage ? `![${a.name}](${a.markdownPath})` : `[${a.name}](${a.markdownPath})`

const files = ref<File[] | null>(null)
async function upload(selected: File[] | null | undefined) {
  if (!selected?.length) return
  for (const file of selected) {
    if (
      file.size > 10 * 1024 * 1024 &&
      !(await confirm({
        title: 'Large file',
        description: `${file.name} is over 10 MB. Large files make your data folder (and its sync) heavier.`,
        confirmLabel: 'Attach anyway',
        icon: 'i-lucide-paperclip',
      }))
    ) {
      continue
    }
    try {
      const attachment = await unwrap(
        api.notes[':id'].attachments.$post({ param: { id: props.noteId }, form: { file } }),
      )
      emit('insert', markdownOf(attachment))
    } catch (error) {
      showError(error, 'Upload failed')
    }
  }
  files.value = null
  await load()
}
</script>

<template>
  <div class="space-y-3">
    <UFileUpload
      v-model="files"
      multiple
      label="Drop files here"
      description="They are attached and added at the end of the note."
      layout="list"
      class="min-h-24"
      :interactive="true"
      @update:model-value="(value) => upload(value as File[] | null)"
    />
    <ul class="space-y-0.5">
      <li
        v-for="attachment in attachments"
        :key="attachment.path"
        class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-[120ms] hover:bg-accented"
      >
        <!-- eslint-disable-next-line vue/no-v-html -- bundled icon SVG (file-icons.generated.ts) -->
        <span
          class="size-4 shrink-0 [&_svg]:size-full"
          data-testid="file-icon"
          v-html="fileIconSvg(attachment.name)"
        />
        <a
          :href="url(attachment)"
          target="_blank"
          rel="noopener"
          class="min-w-0 flex-1 truncate text-sm text-default"
          >{{ attachment.name }}</a
        >
        <span class="shrink-0 text-xs text-dimmed">{{ formatSize(attachment.size) }}</span>
      </li>
    </ul>
    <p v-if="!attachments.length" class="px-2 text-sm text-dimmed">
      No files yet. You can also drop files right into the note.
    </p>
  </div>
</template>
