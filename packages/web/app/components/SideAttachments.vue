<script setup lang="ts">
// Files attached to the note (its `.assets` folder), in the Items tab's Files: open them, view
// images, add more (`pick`: the computer's file picker, from the section's + and empty line;
// dropping them on the note works too), delete one, linked or not (for good, its links and
// images leaving the note: the note page takes them out, on `deleted`). Reports how many.
import { formatSize, type Attachment } from '@tandem/shared'
import { fileIconSvg } from '~/utils/file-icons'

const props = defineProps<{ noteId: string; notePath: string }>()
const emit = defineEmits<{
  insert: [markdown: string]
  /** Deleted for good: its links leave the note, and undo can't bring them back. */
  deleted: [attachment: Attachment]
  count: [count: number]
}>()
const api = useApi()
const showError = useApiErrorToast()
const confirm = useConfirm()

const attachments = ref<Attachment[]>([])
const load = async () => {
  attachments.value = await unwrap(
    api.notes[':id'].attachments.$get({ param: { id: props.noteId } }),
  ).catch(() => [])
  emit('count', attachments.value.length)
}
onMounted(load)
useServerEvents((event) => {
  if ((event.type === 'note' && event.id === props.noteId) || event.type === 'resync') void load()
})

const url = (attachment: Attachment) =>
  `/files/${attachment.path.split('/').map(encodeURIComponent).join('/')}`
const markdownOf = (a: Attachment) =>
  a.isImage ? `![${a.name}](${a.markdownPath})` : `[${a.name}](${a.markdownPath})`

// A plain click on an image shows it full screen (ImageViewer, as a double click on one in the
// note). Other files, and modified clicks (⌘ or Ctrl for a new tab, Shift for a window), keep
// the link's behavior: a new tab. `viewed` outlives `viewing` so the viewer keeps its image
// while it closes.
const viewed = ref<Attachment | null>(null)
const viewing = ref(false)
function view(event: MouseEvent, attachment: Attachment) {
  if (!attachment.isImage || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return
  event.preventDefault()
  viewed.value = attachment
  viewing.value = true
}

// "Click here": the computer's file picker (dropping files on the note is the other way).
const picker = useTemplateRef<HTMLInputElement>('picker')
defineExpose({ pick: () => picker.value?.click() })
function picked(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = [...(input.files ?? [])]
  input.value = ''
  void upload(selected)
}

async function remove(attachment: Attachment) {
  const confirmed = await confirm({
    title: `Delete ${attachment.name}?`,
    description:
      'The file is deleted for good, and its links and images leave the note. Deleting is definitive: undo won’t bring it back.',
    confirmLabel: 'Delete the file',
    confirmColor: 'error',
    icon: 'i-lucide-trash-2',
  })
  if (!confirmed) return
  // The file first: its links leave the note only once it is gone (a failed delete keeps them).
  try {
    await unwrap(
      api.notes[':id'].attachments[':name'].$delete({
        param: { id: props.noteId, name: attachment.name },
      }),
    )
    emit('deleted', attachment)
  } catch (error) {
    showError(error, `Couldn't delete ${attachment.name}`)
  }
  await load()
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
  <div>
    <input
      ref="picker"
      type="file"
      multiple
      class="hidden"
      data-testid="attach-input"
      @change="picked"
    />
    <ul v-if="attachments.length" class="space-y-0.5">
      <li
        v-for="attachment in attachments"
        :key="attachment.path"
        class="group relative flex h-7 items-center gap-2 rounded-md px-2 transition-colors duration-[120ms] hover:bg-accented"
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
        <span
          class="shrink-0 text-xs text-dimmed group-hover:opacity-0 group-has-focus-visible:opacity-0"
          >{{ formatSize(attachment.size) }}</span
        >
        <!-- On hover (or focus), in the size's place. -->
        <UTooltip text="Delete">
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            color="neutral"
            variant="ghost"
            class="absolute end-1 opacity-0 group-hover:opacity-100 hover:text-error focus-visible:opacity-100"
            :aria-label="`Delete ${attachment.name}`"
            @click="remove(attachment)"
          />
        </UTooltip>
      </li>
    </ul>

    <ImageViewer
      v-model:open="viewing"
      :src="viewed && url(viewed)"
      :name="viewed?.name ?? ''"
      :description="viewed ? formatSize(viewed.size) : undefined"
    />
  </div>
</template>
