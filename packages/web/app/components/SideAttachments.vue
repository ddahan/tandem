<script setup lang="ts">
// Files attached to the note (its `.assets` folder): open them, view images, add more (from
// the computer's file picker; dropping them on the note works too).
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

// A plain click on an image shows it in a modal. Other files, and modified clicks (⌘ or Ctrl
// for a new tab, Shift for a window), keep the link's behavior: a new tab. `viewed` outlives
// `viewing` so the modal keeps its image while it closes.
const viewed = ref<Attachment | null>(null)
const viewing = ref(false)
function view(event: MouseEvent, attachment: Attachment) {
  if (!attachment.isImage || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return
  event.preventDefault()
  viewed.value = attachment
  viewing.value = true
}
// The modal takes the focus itself, not its first button: that button's tooltip would show.
function focusModal(event: Event) {
  event.preventDefault()
  ;(event.target as HTMLElement).focus()
}

// "Click here": the computer's file picker (dropping files on the note is the other way).
const picker = useTemplateRef<HTMLInputElement>('picker')
function pick(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = [...(input.files ?? [])]
  input.value = ''
  void upload(selected)
}

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
  await load()
}
</script>

<template>
  <div class="space-y-3">
    <input
      ref="picker"
      type="file"
      multiple
      class="hidden"
      data-testid="attach-input"
      @change="pick"
    />
    <UEmpty
      v-if="!attachments.length"
      icon="i-lucide-paperclip"
      title="No files"
      size="sm"
      variant="naked"
    >
      <template #description>
        Upload a file by dragging it on the note, or
        <button type="button" class="text-primary hover:underline" @click="picker?.click()">
          click here</button
        >.
      </template>
    </UEmpty>
    <ul v-if="attachments.length" class="space-y-0.5">
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
          @click="(event) => view(event, attachment)"
          >{{ attachment.name }}</a
        >
        <span class="shrink-0 text-xs text-dimmed">{{ formatSize(attachment.size) }}</span>
      </li>
    </ul>
    <p v-if="attachments.length" class="px-2 text-xs text-dimmed">
      Upload a file by dragging it on the note, or
      <button type="button" class="text-primary hover:underline" @click="picker?.click()">
        click here</button
      >.
    </p>

    <UModal
      v-model:open="viewing"
      :title="viewed?.name"
      :description="viewed ? formatSize(viewed.size) : undefined"
      :content="{ onOpenAutoFocus: focusModal }"
      :ui="{ content: 'max-w-4xl', body: 'flex justify-center' }"
    >
      <template #actions>
        <UTooltip v-if="viewed" text="Open in a new tab">
          <UButton
            :to="url(viewed)"
            external
            target="_blank"
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            aria-label="Open in a new tab"
            class="ms-auto me-8"
          />
        </UTooltip>
      </template>
      <template #body>
        <img
          v-if="viewed"
          :src="url(viewed)"
          :alt="viewed.name"
          class="max-h-[70vh] max-w-full object-contain"
          data-testid="image-preview"
        />
      </template>
    </UModal>
  </div>
</template>
