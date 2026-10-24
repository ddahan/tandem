<script setup lang="ts">
// One event's line, in an agenda block or placed in the note (EventView): a checkbox (checked,
// struck through), the time label in its calendar's color (a click opens its details), the title
// edited in place (Enter or leaving it saves, Escape puts it back). A feed's event is read-only
// but for its checkbox. In the agenda, a line's grip drags it into the note to place it there.
import { checkRef, timeLabel, type AgendaEvent, type AgendaItem } from '@tandem/shared'
import type { EventFields } from '~/composables/useAgenda'
import { CHOICE_COLOR_STYLES } from '~/utils/choice-colors'
import AgendaEventForm from './AgendaEventForm.vue'
import { EVENT_DRAG_TYPE } from '~/editor/event'

const props = defineProps<{
  item: AgendaItem
  editable: boolean
  draggable?: boolean
  /** Enter in the title goes on to a new line below (an event placed in the note). */
  goesOn?: boolean
}>()
const emit = defineEmits<{
  /** Changed: the event that has the change (another one for a day taken out of a repeat). */
  updated: [event: AgendaEvent]
  removed: []
  /** Enter in the title (with `goesOn`): the title is saved as the focus leaves it. */
  enter: []
}>()

const actions = useAgendaActions()
const { patchItem } = useAgendaDays(() => ({ from: props.item.date, to: props.item.date }))

const labelClass = computed(() =>
  props.item.color ? CHOICE_COLOR_STYLES[props.item.color].tag : 'bg-primary/10 text-primary',
)

async function toggle(checked: boolean) {
  patchItem(props.item.key, { checked })
  await actions.setChecked(props.item, checked)
}

const titleInput = useTemplateRef<HTMLInputElement>('titleInput')

async function saveTitle() {
  const input = titleInput.value
  if (!input) return
  const title = input.value.replace(/\s+/g, ' ').trim()
  if (!title || title === props.item.title) {
    input.value = props.item.title
    return
  }
  const event = await actions.update(props.item, { title })
  if (!event) {
    input.value = props.item.title
    return
  }
  patchItem(props.item.key, { title })
  emit('updated', event)
}

function onTitleKey(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  if (event.key === 'Enter') {
    event.preventDefault()
    // As a to-do's Enter: on to the next line (leaving the title saves it).
    if (props.goesOn) emit('enter')
    else input.blur()
  } else if (event.key === 'Escape') {
    input.value = props.item.title
    input.blur()
  }
}

const open = ref(false)

async function saveDetails(fields: Partial<EventFields>) {
  open.value = false
  const event = await actions.update(props.item, fields)
  if (event) emit('updated', event)
}

async function remove() {
  open.value = false
  if (await actions.remove(props.item)) emit('removed')
}

/**
 * A click anywhere on the line but its controls puts the cursor at the end of the title, as in a
 * to-do's line.
 */
function onLineDown(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('input, button, [draggable="true"]')) return
  const input = titleInput.value
  if (!input) return
  event.preventDefault()
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

/** Dragged out of the agenda into the note: placed where it's dropped (editor/event.ts). */
function onDragStart(event: DragEvent) {
  // Not the agenda block itself, which the editor would move.
  event.stopPropagation()
  event.dataTransfer?.setData(EVENT_DRAG_TYPE, checkRef(props.item))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <!-- As a to-do's line (main.css): the same checkbox, in the same place. -->
  <div class="event-line group cursor-text" data-testid="agenda-event" @mousedown="onLineDown">
    <input
      type="checkbox"
      class="event-check"
      :checked="item.checked"
      :disabled="!editable"
      :aria-label="`Done: ${item.title}`"
      @change="(event) => void toggle((event.target as HTMLInputElement).checked)"
    />
    <UPopover v-model:open="open" :content="{ align: 'start' }">
      <button
        type="button"
        class="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums transition-opacity"
        :class="[labelClass, item.checked && 'opacity-50']"
        :disabled="!editable && !item.feedId"
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
    <input
      ref="titleInput"
      :value="item.title"
      class="min-w-0 flex-1 bg-transparent outline-none"
      :class="item.checked && 'text-muted line-through'"
      :readonly="!editable || !!item.feedId"
      :aria-label="`Title: ${item.title}`"
      data-testid="agenda-title"
      @keydown="onTitleKey"
      @blur="() => void saveTitle()"
    />
    <UIcon
      v-if="item.repeat"
      name="i-lucide-repeat"
      class="size-3.5 shrink-0 text-dimmed"
      aria-label="Repeats"
    />
    <span v-if="item.calendar" class="shrink-0 truncate text-xs text-dimmed">
      {{ item.calendar }}
    </span>
    <!-- Its grip, in the agenda: dragged into the note, the event is placed there. -->
    <span
      v-if="draggable && editable"
      class="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-dimmed opacity-0 transition-opacity group-hover:opacity-100 hover:bg-elevated"
      draggable="true"
      title="Drag into the note to place it there"
      data-testid="agenda-grip"
      @dragstart="onDragStart"
    >
      <UIcon name="i-lucide-grip-vertical" class="size-3.5" />
    </span>
  </div>
</template>
