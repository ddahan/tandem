<script setup lang="ts">
// The Markdown view's text: a textarea with line numbers on the left. Lines wrap, so each
// number is as tall as its line, measured in a hidden copy of the text (same width and font).
// Lines the editor would lose (markdown-loss) have their number in red; `goToLine` selects one.
import { useResizeObserver } from '@vueuse/core'

const props = defineProps<{ modelValue: string; errorLines?: number[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
const mirror = useTemplateRef<HTMLDivElement>('mirror')
const lines = computed(() => props.modelValue.split('\n'))
const heights = ref<number[]>([])
const errors = computed(() => new Set(props.errorLines ?? []))

function measure() {
  const element = textarea.value
  if (element) {
    // As tall as its text: the page scrolls, not the textarea.
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }
  heights.value = [...(mirror.value?.children ?? [])].map(
    (line) => line.getBoundingClientRect().height,
  )
}

watch(lines, () => nextTick(measure), { immediate: true })
useResizeObserver(textarea, measure)

/** Selects line `line` (1-based) and scrolls to it. */
function goToLine(line: number) {
  const element = textarea.value
  if (!element || line < 1 || line > lines.value.length) return
  const start = lines.value.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0)
  element.focus({ preventScroll: true })
  element.setSelectionRange(start, start + lines.value[line - 1]!.length)
  document
    .querySelector(`[data-source-line="${line}"]`)
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

defineExpose({ goToLine })
</script>

<template>
  <div
    class="flex rounded-md bg-elevated/50 font-mono text-sm leading-6 ring transition-shadow ring-inset"
    :class="
      errors.size
        ? 'ring-2 ring-error'
        : 'ring-transparent focus-within:ring-2 focus-within:ring-primary'
    "
  >
    <!-- Line numbers: not selectable, not read out (the textarea has the text). -->
    <div aria-hidden="true" class="shrink-0 py-2 ps-3 pe-3 text-end text-dimmed select-none">
      <div
        v-for="(_, index) in lines"
        :key="index"
        :data-source-line="index + 1"
        :style="heights[index] ? { height: `${heights[index]}px` } : undefined"
        :class="errors.has(index + 1) && 'font-semibold text-error'"
      >
        {{ index + 1 }}
      </div>
    </div>
    <div class="relative min-w-0 flex-1">
      <textarea
        ref="textarea"
        :value="modelValue"
        aria-label="Markdown source"
        spellcheck="false"
        rows="20"
        class="block w-full resize-none overflow-hidden bg-transparent py-2 pe-12 break-words whitespace-pre-wrap text-highlighted outline-none [font-variant-ligatures:none]"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      />
      <!-- The same text, wrapped the same way, line by line: the numbers' heights. -->
      <div
        ref="mirror"
        aria-hidden="true"
        class="invisible absolute inset-x-0 top-0 py-2 pe-12 break-words whitespace-pre-wrap [font-variant-ligatures:none]"
      >
        <div v-for="(line, index) in lines" :key="index">{{ line || ' ' }}</div>
      </div>
    </div>
  </div>
</template>
