<script setup lang="ts">
// Who wrote what: the note rendered block by block, each with a colored bar for its author
// (the author who last changed its lines) and, on hover, the author and date.
import { formatDateTime, authorLabel, type BlameRange } from '@myfluence/shared'
import { blocksWithAuthors, authorColor } from '~/utils/authorship'
import { renderMarkdown } from '~/utils/render-markdown'

const props = defineProps<{ noteId: string; content: string; notePath: string }>()
const api = useApi()
const { settings } = useSettings()

const blame = ref<BlameRange[]>([])
const loading = ref(true)
onMounted(async () => {
  try {
    blame.value = await unwrap(api.notes[':id'].blame.$get({ param: { id: props.noteId } }))
  } finally {
    loading.value = false
  }
})

const blocks = computed(() =>
  blocksWithAuthors(props.content, blame.value).map((block) =>
    Object.assign(block, { html: renderMarkdown(block.markdown, props.notePath) }),
  ),
)

const authors = computed(() => {
  const seen = new Map<string, number>()
  for (const block of blocks.value)
    seen.set(block.author, (seen.get(block.author) ?? 0) + block.lineCount)
  return [...seen].toSorted((a, b) => b[1] - a[1]).map(([author, lines]) => ({ author, lines }))
})

const label = (author: string) => authorLabel(author, settings.value.displayName)
</script>

<template>
  <div>
    <div
      class="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-default px-3 py-2 text-xs"
    >
      <span class="text-muted">Written by</span>
      <span v-for="{ author, lines } in authors" :key="author" class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-full" :style="{ background: authorColor(author) }" />
        <span class="font-medium text-default">{{ label(author) }}</span>
        <span class="text-dimmed">{{ lines }} line{{ lines > 1 ? 's' : '' }}</span>
      </span>
      <span v-if="!authors.length && !loading" class="text-dimmed"
        >Nobody yet: the note is empty.</span
      >
    </div>

    <div class="space-y-1">
      <UTooltip
        v-for="(block, index) in blocks"
        :key="index"
        :text="`${label(block.author)} · ${formatDateTime(block.at)}`"
        :content="{ side: 'left' }"
      >
        <div
          class="relative rounded-md py-1 ps-5 pe-2 transition-colors hover:bg-elevated/50"
          data-testid="authorship-block"
        >
          <span
            class="absolute inset-y-1.5 start-1 w-1 rounded-full"
            :style="{ background: authorColor(block.author) }"
          />
          <!-- eslint-disable-next-line vue/no-v-html -- sanitized by renderMarkdown -->
          <div class="rendered-markdown" v-html="block.html" />
        </div>
      </UTooltip>
    </div>
  </div>
</template>
