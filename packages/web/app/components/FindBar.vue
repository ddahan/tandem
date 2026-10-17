<script setup lang="ts">
// Find (and replace) in the note, as in VS Code: ↵ / ⇧↵ for the next / previous match, Esc to
// close. Drives the editor's Find extension (editor/find.ts).
import type { Editor } from '@tiptap/vue-3'
import { findState } from '~/editor/find'

const props = defineProps<{ editor: Editor; initialQuery?: string }>()
const emit = defineEmits<{ close: [] }>()
const replacing = defineModel<boolean>('replacing', { default: false })

const query = ref(props.initialQuery ?? '')
const replacement = ref('')
const caseSensitive = ref(false)
const state = shallowRef(findState(props.editor.state))
const input = useTemplateRef<{ inputRef: HTMLInputElement }>('input')

const refresh = () => (state.value = findState(props.editor.state))
props.editor.on('transaction', refresh)
onBeforeUnmount(() => {
  props.editor.off('transaction', refresh)
  if (!props.editor.isDestroyed) props.editor.commands.clearFind()
})

watch(
  [query, caseSensitive],
  () => props.editor.commands.setFind(query.value, { caseSensitive: caseSensitive.value }),
  {
    immediate: true,
  },
)

const count = computed(() => {
  if (!query.value) return ''
  const { matches, current } = state.value
  return matches.length ? `${current + 1} of ${matches.length}` : 'No results'
})

function next(event?: KeyboardEvent) {
  if (event?.shiftKey) props.editor.commands.findPrevious()
  else props.editor.commands.findNext()
}

function close() {
  emit('close')
  // Back to the note, with the current match selected.
  props.editor.commands.focus()
}

/** Focuses the field and selects its text (⌘F again, with the bar open). */
function focus(text?: string) {
  if (text) query.value = text
  input.value?.inputRef.focus()
  input.value?.inputRef.select()
}

defineExpose({ focus })
onMounted(() => focus())
</script>

<template>
  <div
    class="flex w-96 flex-col gap-1.5 rounded-lg border border-default bg-default p-1.5 shadow-sm"
    role="search"
    data-testid="find-bar"
    @keydown.esc.prevent="close"
  >
    <div class="flex items-center gap-1">
      <UButton
        :icon="replacing ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="replacing ? 'Hide replace' : 'Show replace'"
        @click="replacing = !replacing"
      />
      <UInput
        ref="input"
        v-model="query"
        placeholder="Find"
        size="sm"
        class="min-w-0 flex-1"
        aria-label="Find in the note"
        :ui="{ trailing: 'pe-1' }"
        @keydown.enter.prevent="next"
      >
        <template #trailing>
          <UTooltip text="Match case">
            <UButton
              icon="i-lucide-case-sensitive"
              :color="caseSensitive ? 'primary' : 'neutral'"
              :variant="caseSensitive ? 'soft' : 'ghost'"
              size="xs"
              aria-label="Match case"
              :aria-pressed="caseSensitive"
              @click="caseSensitive = !caseSensitive"
            />
          </UTooltip>
        </template>
      </UInput>
      <span
        class="w-20 shrink-0 text-center text-xs text-muted tabular-nums"
        data-testid="find-count"
        >{{ count }}</span
      >
      <UTooltip text="Previous match" :kbds="['shift', 'enter']">
        <UButton
          icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Previous match"
          @click="editor.commands.findPrevious()"
        />
      </UTooltip>
      <UTooltip text="Next match" :kbds="['enter']">
        <UButton
          icon="i-lucide-arrow-down"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Next match"
          @click="editor.commands.findNext()"
        />
      </UTooltip>
      <UTooltip text="Close" :kbds="['escape']">
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Close find"
          @click="close"
        />
      </UTooltip>
    </div>

    <div v-if="replacing" class="flex items-center gap-1 ps-7">
      <UInput
        v-model="replacement"
        placeholder="Replace"
        size="sm"
        class="min-w-0 flex-1"
        aria-label="Replace with"
        @keydown.enter.prevent="
          (event: KeyboardEvent) =>
            event.metaKey || event.ctrlKey
              ? editor.commands.replaceAllMatches(replacement)
              : editor.commands.replaceMatch(replacement)
        "
      />
      <UTooltip text="Replace" :kbds="['enter']">
        <UButton
          icon="i-lucide-replace"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Replace"
          @click="editor.commands.replaceMatch(replacement)"
        />
      </UTooltip>
      <UTooltip text="Replace all" :kbds="['meta', 'enter']">
        <UButton
          icon="i-lucide-replace-all"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Replace all"
          @click="editor.commands.replaceAllMatches(replacement)"
        />
      </UTooltip>
    </div>
  </div>
</template>
