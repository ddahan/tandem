<script setup lang="ts">
// A day's agenda, at the top of its daily note, above the text: Tandem's events and the calendar
// feeds' together, all-day ones first, then by time (the server's order). Shown only when the
// day has events, or while one is being added (`/event`, useAgendaFocus). Not part of the note:
// nothing of it is in the Markdown, and it never writes the note's file.
//
// Its + button adds an event: a new line, with its checkbox, where it is typed: a time then the
// title (`14h Standup`, `13:30-14:30 Lunch`), or a title alone for all day; the time becomes
// the label as soon as a space follows it (useEventDraft). A divider
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

async function startAdding() {
  adding.value = true
  await nextTick()
  addInput.value?.focus()
}

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
    class="day-agenda space-y-[0.2em]"
    aria-label="Events"
    data-testid="agenda"
  >
    <AgendaLine v-for="item in items" :key="item.key" :item="item" />
    <!-- Adding: a new line, with its checkbox, where the event is typed. -->
    <div v-if="adding" class="agenda-line">
      <input
        type="checkbox"
        class="agenda-check pointer-events-none"
        tabindex="-1"
        aria-hidden="true"
      />
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
        class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dimmed"
        :placeholder="draft.time.value ? 'Title' : '14h Standup'"
        aria-label="New event"
        data-testid="agenda-add"
        @input="draft.input(($event.target as HTMLInputElement).value)"
        @keydown="onAddKey"
        @blur="onAddBlur"
      />
    </div>
    <UButton
      v-else
      icon="i-lucide-plus"
      color="neutral"
      variant="ghost"
      size="xs"
      class="ms-0.5"
      aria-label="Add an event"
      data-testid="agenda-new"
      @click="startAdding"
    />
  </section>
  <!-- Between the day's events and its note. -->
  <USeparator v-if="visible" class="my-5" />
</template>
