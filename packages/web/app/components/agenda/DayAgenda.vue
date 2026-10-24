<script setup lang="ts">
// A day's agenda, at the top of its daily note, above the text: Tandem's events and the calendar
// feeds' together, all-day ones first, then by time (the server's order). Shown only when the
// day has events, or while one is being added (`/event`, useAgendaFocus). Not part of the note:
// nothing of it is in the Markdown, and it never writes the note's file.
//
// Its last line adds an event (only its + shows until the events are hovered), typed on one
// line: a time then the title (`14h Standup`, `13:30-14:30 Lunch`), or a title alone for all
// day; the time becomes the label as soon as a space follows it (useEventDraft). A divider
// sets the events apart from the note. Enter adds it and stays on the line; Escape, or leaving it
// empty, stops adding.
import type { EventFields } from '~/composables/useAgenda'
import { timeLabel } from '@tandem/shared'
import AgendaLine from './AgendaLine.vue'

const props = defineProps<{ date: string }>()

const { items, reload } = useAgendaDays(() => ({ from: props.date, to: props.date }))
const actions = useAgendaActions()

const adding = ref(false)
const addInput = useTemplateRef<HTMLInputElement>('addInput')
const visible = computed(() => items.value.length > 0 || adding.value)

// `/event` (the note's editor) asks for this day's add line.
const focus = useAgendaFocus()
watch(
  () => focus.value,
  async (request) => {
    if (!request || request.date !== props.date) return
    focus.value = null
    adding.value = true
    await nextTick()
    addInput.value?.focus()
  },
  { immediate: true },
)

const draft = useEventDraft()

async function add() {
  const line = draft.line.value
  if (!line.title) return
  const fields: EventFields = { ...line, date: props.date, repeat: null, until: null }
  if (!(await actions.create(fields))) return
  draft.clear()
  await reload()
}

function onAddKey(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    void add()
  } else if (event.key === 'Escape') {
    draft.clear()
    addInput.value?.blur()
  } else {
    draft.keydown(event)
  }
}

function onAddBlur() {
  if (!draft.text.value.trim() && !draft.time.value) adding.value = false
}
</script>

<template>
  <section
    v-if="visible"
    class="day-agenda group/agenda space-y-[0.2em]"
    aria-label="Events"
    data-testid="agenda"
  >
    <AgendaLine v-for="item in items" :key="item.key" :item="item" />
    <div class="agenda-line text-muted">
      <UIcon name="i-lucide-plus" class="agenda-check" />
      <span
        v-if="draft.time.value"
        class="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-medium text-primary tabular-nums"
        data-testid="agenda-draft-time"
      >
        {{ timeLabel(draft.time.value) }}
      </span>
      <input
        ref="addInput"
        :value="draft.text.value"
        class="min-w-0 flex-1 bg-transparent text-default outline-none placeholder:text-transparent group-hover/agenda:placeholder:text-dimmed focus:placeholder:text-dimmed"
        :placeholder="draft.time.value ? 'Title' : 'Add event: 14h Standup, or a title for all day'"
        aria-label="Add event"
        data-testid="agenda-add"
        @input="draft.input(($event.target as HTMLInputElement).value)"
        @focus="adding = true"
        @keydown="onAddKey"
        @blur="onAddBlur"
      />
    </div>
  </section>
  <!-- Between the day's events and its note. -->
  <USeparator v-if="visible" class="my-5" />
</template>
