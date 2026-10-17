<script setup lang="ts">
// Files attached to the note (its `.assets` folder): open, copy or insert their Markdown, add.
import { formatSize, type Attachment } from '@tandem/shared'
import { fileIconSvg } from '~/utils/file-icons'

const props = defineProps<{ noteId: string; notePath: string }>()
const emit = defineEmits<{ insert: [markdown: string] }>()
const api = useApi()
const toast = useToast()
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

async function copy(attachment: Attachment) {
  await navigator.clipboard.writeText(markdownOf(attachment))
  toast.add({ title: 'Markdown copied', icon: 'i-lucide-clipboard-check', duration: 1500 })
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
        class="group flex items-center gap-2 rounded-md px-2 py-1 transition-colors duration-[120ms] hover:bg-accented"
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
        <!-- The size and the actions share one cell, sized for the larger: hovering swaps them
             without moving the name. -->
        <span class="grid shrink-0 items-center justify-items-end">
          <span
            class="col-start-1 row-start-1 text-xs text-dimmed group-focus-within:invisible group-hover:invisible"
            >{{ formatSize(attachment.size) }}</span
          >
          <span
            class="invisible col-start-1 row-start-1 flex gap-0.5 group-focus-within:visible group-hover:visible"
          >
            <UTooltip text="Copy Markdown">
              <UButton
                icon="i-lucide-copy"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Copy Markdown"
                @click="copy(attachment)"
              />
            </UTooltip>
            <UTooltip text="Insert at the end">
              <UButton
                icon="i-lucide-corner-down-left"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Insert"
                @click="emit('insert', markdownOf(attachment))"
              />
            </UTooltip>
          </span>
        </span>
      </li>
    </ul>
    <p v-if="!attachments.length" class="px-2 text-sm text-dimmed">
      No files yet. You can also drop files right into the note.
    </p>
  </div>
</template>
