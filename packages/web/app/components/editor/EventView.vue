<script setup lang="ts">
// An event placed in the note (editor/event.ts): its line (AgendaLine), from the day's events.
// Being typed (no ref yet), it is a line where the time becomes the label (useEventDraft): Enter,
// or leaving it with a title, saves the event (Enter then goes on to a new line below); Escape,
// or leaving it without a title, turns it back into the text typed. Backspace in an empty line
// removes it. Changed to another day, or deleted, its block goes; a day taken out of a repeat
// (a new event) keeps its place.
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { checkRef, timeLabel, type AgendaEvent } from '@tandem/shared'
import AgendaLine from './AgendaLine.vue'

const props = defineProps(nodeViewProps)

const date = computed(() => (props.extension.options.date as () => string | null)())
const editable = computed(() => props.editor.isEditable)
const eventRef = computed(() => String(props.node.attrs.ref ?? ''))
const { items, loaded, reload } = useAgendaDays(() =>
  date.value ? { from: date.value, to: date.value } : null,
)
const item = computed(() => items.value.find((i) => checkRef(i) === eventRef.value) ?? null)
const missing = computed(() => !!eventRef.value && loaded.value && !item.value)
const selected = useBlockSelected(props.editor, () => props.selected)
const actions = useAgendaActions()

function remove() {
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  const { tr } = props.editor.state
  props.editor.view.dispatch(tr.delete(pos, pos + props.node.nodeSize))
}

function onUpdated(event: AgendaEvent) {
  if (event.date !== date.value) remove()
  else if (event.id !== eventRef.value) props.updateAttributes({ ref: event.id })
}

// --- Being typed -----------------------------------------------------------------------------

const draft = useEventDraft()
const input = useTemplateRef<HTMLInputElement>('input')
const saving = ref(false)

onMounted(async () => {
  if (eventRef.value) return
  draft.input(String(props.node.attrs.text ?? ''))
  await nextTick()
  input.value?.focus()
  const end = input.value?.value.length ?? 0
  input.value?.setSelectionRange(end, end)
})

/** Back to what was typed, as text (the cursor at its end, unless `focus` is false). */
function toText(focus = true) {
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  const time = draft.time.value
  const typed = `${time ? `${time.end ? `${time.start}-${time.end}` : time.start} ` : ''}${draft.text.value}`
  const { schema } = props.editor.state
  const paragraph = schema.nodes.paragraph!.create(null, typed ? schema.text(typed) : null)
  const chain = props.editor.chain().command(({ tr }) => {
    tr.replaceWith(pos, pos + props.node.nodeSize, paragraph)
    return true
  })
  if (focus) chain.setTextSelection(pos + 1 + typed.length).focus()
  chain.run()
}

/**
 * Saves the event being typed. With `next` (Enter), the cursor goes on to a new line below at
 * once, while the event is made: what is typed next isn't lost.
 */
async function save(next: boolean) {
  const line = draft.line.value
  if (!line.title || !date.value || saving.value) return
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  saving.value = true
  if (next) {
    const after = pos + props.node.nodeSize
    props.editor
      .chain()
      .insertContentAt(after, { type: 'paragraph' })
      .setTextSelection(after + 1)
      .focus()
      .run()
  }
  const event = await actions.create({ ...line, date: date.value, repeat: null, until: null })
  saving.value = false
  if (typeof props.getPos() !== 'number') return
  if (!event) {
    toText(false)
    return
  }
  // Named first: placed in the note before the day's events show it (else the agenda block
  // would come for it).
  props.updateAttributes({ ref: event.id, text: '' })
  void reload()
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLInputElement
  if (event.key === 'Enter') {
    event.preventDefault()
    void save(true)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    toText()
  } else if (
    event.key === 'Backspace' &&
    !draft.time.value &&
    !target.value &&
    target.selectionStart === 0
  ) {
    event.preventDefault()
    toText()
  } else {
    draft.keydown(event)
  }
}

function onBlur() {
  // Saving, or already turned back into text.
  if (saving.value || eventRef.value || typeof props.getPos() !== 'number') return
  if (draft.line.value.title) void save(false)
  else toText()
}
</script>

<template>
  <NodeViewWrapper
    class="event-block my-0.5"
    :class="selected && 'is-selected'"
    contenteditable="false"
    data-testid="event-block"
    :data-event="eventRef"
  >
    <div v-if="!eventRef" class="flex min-h-8 items-center gap-2.5">
      <UIcon name="i-lucide-calendar-plus" class="size-4 shrink-0 text-muted" />
      <span
        v-if="draft.time.value"
        class="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-medium text-primary tabular-nums"
        data-testid="event-draft-time"
      >
        {{ timeLabel(draft.time.value) }}
      </span>
      <input
        ref="input"
        :value="draft.text.value"
        class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dimmed"
        :placeholder="draft.time.value ? 'Title' : '14:00 Standup, or a title for all day'"
        :readonly="saving"
        aria-label="New event"
        data-testid="event-draft"
        @input="draft.input(($event.target as HTMLInputElement).value)"
        @keydown="onKey"
        @blur="onBlur"
      />
    </div>
    <AgendaLine
      v-else-if="item"
      :item="item"
      :editable="editable"
      @updated="onUpdated"
      @removed="remove"
    />
    <div
      v-else-if="missing"
      class="flex min-h-8 items-center gap-2 text-sm text-muted"
      data-testid="event-missing"
    >
      <UIcon name="i-lucide-calendar-x" class="size-4" />
      This event isn’t on this day anymore.
      <UButton
        v-if="editable"
        label="Remove"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="remove"
      />
    </div>
    <div v-else class="min-h-8" />
  </NodeViewWrapper>
</template>
