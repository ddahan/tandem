<script setup lang="ts">
// Picks the icon of a page or folder: an emoji (search, categories, recently used), an image
// from the computer, or none.
import { useLocalStorage } from '@vueuse/core'
import { emojiGroups, searchEmojis, type PickerEmoji } from '~/utils/emoji-groups'

const props = defineProps<{ nodeId: string; hasIcon: boolean }>()
const emit = defineEmits<{ done: [] }>()

const api = useApi()
const showError = useApiErrorToast()

const query = ref('')
const groups = emojiGroups()
const activeGroup = ref(groups[0]!.id)
const recent = useLocalStorage<string[]>('tandem-recent-icons', [])
const busy = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const visible = computed<PickerEmoji[]>(() =>
  query.value.trim()
    ? searchEmojis(query.value)
    : (groups.find((group) => group.id === activeGroup.value)?.emojis ?? []),
)

async function run(task: () => Promise<unknown>) {
  busy.value = true
  try {
    await task()
    emit('done')
  } catch (error) {
    showError(error, 'Could not change the icon')
  } finally {
    busy.value = false
  }
}

function pick(emoji: string) {
  recent.value = [emoji, ...recent.value.filter((e) => e !== emoji)].slice(0, 16)
  return run(() =>
    unwrap(api.nodes[':id'].icon.$put({ param: { id: props.nodeId }, json: { emoji } })),
  )
}

function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  return run(() =>
    unwrap(api.nodes[':id'].icon.$post({ param: { id: props.nodeId }, form: { file } })),
  )
}

function remove() {
  return run(() => unwrap(api.nodes[':id'].icon.$delete({ param: { id: props.nodeId } })))
}
</script>

<template>
  <div class="flex w-80 flex-col gap-2 p-2" data-testid="icon-picker">
    <div class="flex items-center gap-1">
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Search emojis…"
        size="sm"
        autofocus
        class="flex-1"
        aria-label="Search emojis"
      />
      <UTooltip text="Upload an image">
        <UButton
          icon="i-lucide-image-up"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Upload an image"
          :loading="busy"
          @click="fileInput?.click()"
        />
      </UTooltip>
      <UTooltip v-if="hasIcon" text="Use the default icon">
        <UButton
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Use the default icon"
          @click="remove"
        />
      </UTooltip>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="hidden"
        data-testid="icon-upload"
        @change="upload"
      />
    </div>

    <div v-if="!query.trim()" class="flex justify-between border-b border-default pb-1">
      <UTooltip v-for="group in groups" :key="group.id" :text="group.label">
        <button
          type="button"
          class="grid size-7 place-items-center rounded-md text-base transition-colors hover:bg-elevated"
          :class="activeGroup === group.id && 'bg-elevated'"
          :aria-label="group.label"
          @click="activeGroup = group.id"
        >
          {{ group.emojis[0]?.emoji }}
        </button>
      </UTooltip>
    </div>

    <div class="h-56 overflow-y-auto">
      <template v-if="!query.trim() && recent.length">
        <p class="px-1 pb-1 text-xs text-dimmed">Recent</p>
        <div class="mb-2 grid grid-cols-8">
          <button
            v-for="emoji in recent"
            :key="`recent-${emoji}`"
            type="button"
            class="grid size-9 place-items-center rounded-md text-xl hover:bg-elevated"
            @click="pick(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </template>
      <div class="grid grid-cols-8">
        <button
          v-for="item in visible"
          :key="item.emoji"
          type="button"
          class="grid size-9 place-items-center rounded-md text-xl hover:bg-elevated"
          :title="item.name"
          :aria-label="item.name"
          @click="pick(item.emoji)"
        >
          {{ item.emoji }}
        </button>
      </div>
      <p v-if="query.trim() && !visible.length" class="py-8 text-center text-sm text-dimmed">
        No emoji found
      </p>
    </div>
  </div>
</template>
