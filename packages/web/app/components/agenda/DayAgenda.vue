<script setup lang="ts">
// A day's agenda, at the top of its daily note, above the text: Tandem's events and the calendar
// feeds' together, all-day ones first, then by time (the server's order). Shown only when the
// day has events, or while one is being added (`/event`, useAgendaFocus). Not part of the note:
// nothing of it is in the Markdown, and it never writes the note's file.
//
// Its + opens a new line, with its checkbox, where an event is typed: a time then the title
// (`14h Standup`, `13:30-14:30 Lunch`), or a title alone for all day (useEventDraft makes the
// time the label). Enter adds it and opens the next line; Escape, leaving it empty, or Backspace
// in it empty closes it. The keys move as in lines of text: Enter in a title opens a new event,
// Backspace in an emptied one deletes it, ↑ ↓ go from line to line, ↓ from the last into the
// note. A divider sets the events apart from the note.
import type { EventFields } from '~/composables/useAgenda'
import { timeLabel } from '@tandem/shared'
import AgendaLine from './AgendaLine.vue'

const props = defineProps<{ date: string }>()
/** ↓ from the last line: on to the note's text. */
const emit = defineEmits<{ leave: [] }>()

const { items, reload } = useAgendaDays(() => ({ from: props.date, to: props.date }))
const actions = useAgendaActions()

const adding = ref(false)
const addInput = useTemplateRef<HTMLInputElement>('addInput')
const section = useTemplateRef<HTMLElement>('section')
const visible = computed(() => items.value.length > 0 || adding.value)

// `/event` (the note's editor) asks for this day's add line.
const focus = useAgendaFocus()
watch(
  () => focus.value,
  (request) => {
    if (!request || request.date !== props.date) return
    focus.value = null
    void startAdding()
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
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusTitle(items.value.length - 1, addInput.value?.selectionStart ?? Infinity)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    emit('leave')
  } else if (event.key === 'Backspace' && !draft.time.value && !draft.text.value) {
    // An empty new line: it goes, as an empty line would, the cursor at the end of the last one.
    event.preventDefault()
    adding.value = false
    focusTitle(items.value.length - 1)
  } else {
    draft.keydown(event)
  }
}

/** The cursor in the `index`-th event's title, at `caret` (its end by default). */
function focusTitle(index: number, caret = Infinity) {
  const titles = section.value?.querySelectorAll<HTMLInputElement>('[data-testid="agenda-title"]')
  const title = index >= 0 ? titles?.[index] : undefined
  if (!title) return
  const at = Math.min(caret, title.value.length)
  title.focus()
  title.setSelectionRange(at, at)
}

/** ↑ ↓ between lines: an event's title, past the last the new event's line, then the note. */
function move(index: number, caret: number) {
  if (index < 0) return
  if (index < items.value.length) {
    focusTitle(index, caret)
  } else if (adding.value) {
    addInput.value?.focus()
  } else {
    emit('leave')
  }
}

/** Backspace in an emptied title: the event goes, the cursor at the end of the line above. */
async function erase(index: number) {
  const item = items.value[index]
  if (!item) return
  focusTitle(index - 1)
  await actions.remove(item)
}

function onAddBlur() {
  if (!draft.text.value.trim() && !draft.time.value) adding.value = false
}
</script>

<template>
  <section
    v-if="visible"
    ref="section"
    class="day-agenda space-y-[0.2em]"
    aria-label="Events"
    data-testid="agenda"
  >
    <AgendaLine
      v-for="(item, index) in items"
      :key="item.key"
      :item="item"
      @enter="startAdding"
      @erase="erase(index)"
      @move="(step, caret) => move(index + step, caret)"
    />
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
    <!-- In the checkboxes' column, their size. -->
    <div v-else class="agenda-line">
      <button
        type="button"
        class="agenda-check flex items-center justify-center rounded-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted"
        aria-label="Add an event"
        data-testid="agenda-new"
        @click="startAdding"
      >
        <UIcon name="i-lucide-plus" class="size-full" />
      </button>
    </div>
  </section>
  <!-- Between the day's events and its note. -->
  <USeparator v-if="visible" class="my-5" />
</template>
