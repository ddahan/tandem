<script setup lang="ts">
// One event's line in a day's agenda (DayAgenda): a checkbox (checked, struck through), the time
// label in its calendar's color (a click opens its details), the title edited in place (leaving
// it saves, Escape puts it back; Enter goes on to a new event; Backspace in it empty deletes the
// event; ↑ ↓ go to the line above or below), and, on hover, a button right after it that deletes it. A feed's event is read-only
// but for its checkbox. Plain fields, outside the note's editor.
import { timeLabel, type AgendaItem } from '@tandem/shared'
import type { EventFields } from '~/composables/useAgenda'
import { CHOICE_COLOR_STYLES } from '~/utils/choice-colors'
import AgendaEventForm from './AgendaEventForm.vue'

const props = defineProps<{ item: AgendaItem }>()
const emit = defineEmits<{
  /** Enter in the title: the day's agenda goes on to a new event (the title saved as it's left). */
  enter: []
  /** Backspace in the title emptied: the agenda deletes the event, the cursor on the line above. */
  erase: []
  /** ↑ or ↓ in the title: on to the line above or below, the cursor as far along. */
  move: [step: -1 | 1, caret: number]
}>()

const actions = useAgendaActions()
const { patchItem } = useAgendaDays(() => ({ from: props.item.date, to: props.item.date }))
const readOnly = computed(() => !!props.item.feedId)

const labelClass = computed(() =>
  props.item.color ? CHOICE_COLOR_STYLES[props.item.color].tag : 'bg-primary/10 text-primary',
)

async function toggle(checked: boolean) {
  patchItem(props.item.key, { checked })
  await actions.setChecked(props.item, checked)
}

const titleInput = useTemplateRef<HTMLInputElement>('titleInput')
// What the title field holds while typed in: it sizes the field.
const titleText = ref(props.item.title)
watch(
  () => props.item.title,
  (title) => (titleText.value = title),
)

async function saveTitle() {
  const input = titleInput.value
  if (!input) return
  const title = input.value.replace(/\s+/g, ' ').trim()
  if (!title || title === props.item.title) {
    input.value = props.item.title
    titleText.value = props.item.title
    return
  }
  patchItem(props.item.key, { title })
  if (!(await actions.update(props.item, { title }))) {
    input.value = props.item.title
    titleText.value = props.item.title
  }
}

function onTitleKey(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('enter')
  } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey) {
    event.preventDefault()
    emit('move', event.key === 'ArrowUp' ? -1 : 1, input.selectionStart ?? input.value.length)
  } else if (event.key === 'Backspace' && !input.value && !readOnly.value) {
    event.preventDefault()
    emit('erase')
  } else if (event.key === 'Escape') {
    input.value = props.item.title
    titleText.value = props.item.title
    input.blur()
  }
}

/** A click anywhere on the line but its controls puts the cursor at the end of the title. */
function onLineDown(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('input, button')) return
  const input = titleInput.value
  if (!input || readOnly.value) return
  event.preventDefault()
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

const open = ref(false)

async function saveDetails(fields: Partial<EventFields>) {
  open.value = false
  await actions.update(props.item, fields)
}

async function remove() {
  open.value = false
  await actions.remove(props.item)
}
</script>

<template>
  <div
    class="agenda-line group"
    :class="!readOnly && 'cursor-text'"
    data-testid="agenda-event"
    @mousedown="onLineDown"
  >
    <input
      type="checkbox"
      class="agenda-check"
      :checked="item.checked"
      :aria-label="`Done: ${item.title}`"
      @change="(event) => void toggle((event.target as HTMLInputElement).checked)"
    />
    <UPopover v-model:open="open" :content="{ align: 'start' }">
      <button
        type="button"
        class="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums transition-opacity"
        :class="[labelClass, item.checked && 'opacity-50']"
        data-testid="agenda-time"
      >
        {{ timeLabel(item) }}
      </button>
      <template #content>
        <AgendaEventForm
          :item="item"
          @save="(fields) => void saveDetails(fields)"
          @remove="() => void remove()"
          @close="open = false"
        />
      </template>
    </UPopover>
    <!-- The title as wide as its text (a hidden copy sizes it: `size="1"` lets the field be
         narrower than a field's usual width), its marks and × right after. -->
    <span class="inline-grid min-w-0">
      <span
        class="invisible col-start-1 row-start-1 overflow-hidden pe-1 whitespace-pre"
        aria-hidden="true"
        >{{ titleText || ' ' }}</span
      >
      <input
        ref="titleInput"
        :value="titleText"
        size="1"
        class="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none"
        :class="item.checked && 'text-muted line-through'"
        :readonly="readOnly"
        :aria-label="`Title: ${item.title}`"
        data-testid="agenda-title"
        @input="titleText = ($event.target as HTMLInputElement).value"
        @keydown="onTitleKey"
        @blur="() => void saveTitle()"
      />
    </span>
    <UIcon
      v-if="item.repeat"
      name="i-lucide-repeat"
      class="size-3.5 shrink-0 text-dimmed"
      aria-label="Repeats"
    />
    <span v-if="item.calendar" class="shrink-0 truncate text-xs text-dimmed">
      {{ item.calendar }}
    </span>
    <UButton
      v-if="!readOnly"
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="xs"
      class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      :aria-label="`Delete ${item.title}`"
      data-testid="agenda-delete"
      @click="remove"
    />
    <span class="flex-1" />
  </div>
</template>
