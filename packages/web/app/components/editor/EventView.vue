<script setup lang="ts">
// An event placed in the note (editor/event.ts): its line (AgendaLine), from the day's events.
// Being typed (no ref yet), it is a line where the time becomes the label (useEventDraft): Enter,
// or leaving it with a title, saves the event (Enter then goes on to a new line below); Escape,
// or leaving it without a title, turns it back into the text typed. Backspace in an empty line
// removes it. Changed to another day, or deleted, its block goes; a day taken out of a repeat
// (a new event) keeps its place.
import { TextSelection } from '@tiptap/pm/state'
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

/**
 * This block's position in the note, or null once it's gone. Checked against the document: the
 * node view's own position and node can lag behind it (one too far, after the line it replaced).
 */
function position(): number | null {
  const pos = props.getPos()
  if (typeof pos !== 'number') return null
  const { doc } = props.editor.state
  const ref = String(props.node.attrs.ref ?? '')
  const isThis = (at: number) => {
    const node = at >= 0 ? doc.nodeAt(at) : null
    return node?.type.name === 'event' && String(node.attrs.ref ?? '') === ref
  }
  if (isThis(pos)) return pos
  if (isThis(pos - 1)) return pos - 1
  return null
}

/** This block's size, as the document has it (the node view's node can lag behind). */
function size(pos: number): number {
  return props.editor.state.doc.nodeAt(pos)?.nodeSize ?? 1
}

function remove() {
  const pos = position()
  if (pos === null) return
  const { tr } = props.editor.state
  props.editor.view.dispatch(tr.delete(pos, pos + size(pos)))
}

function onUpdated(event: AgendaEvent) {
  if (event.date !== date.value) remove()
  else if (event.id !== eventRef.value) props.updateAttributes({ ref: event.id })
}

/**
 * On to the line below, as a to-do's Enter: a new empty line, the cursor in it (an empty line
 * there already takes it).
 */
function nextLine() {
  const pos = position()
  if (pos === null) return
  const { state, view } = props.editor
  const after = pos + size(pos)
  const next = state.doc.nodeAt(after)
  const tr = state.tr
  if (!(next?.type.name === 'paragraph' && next.content.size === 0)) {
    tr.insert(after, state.schema.nodes.paragraph!.create())
  }
  // The field left first: the editor, around it, can't take the focus from it. Then at once,
  // so that the next keys typed land on the new line (and next frame again, as TipTap does).
  const active = document.activeElement
  if (active instanceof HTMLElement && view.dom.contains(active) && active !== view.dom)
    active.blur()
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView())
  view.focus()
  props.editor.commands.focus()
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
  const pos = position()
  if (pos === null) return
  const time = draft.time.value
  const typed = `${time ? `${time.end ? `${time.start}-${time.end}` : time.start} ` : ''}${draft.text.value}`
  const { schema } = props.editor.state
  const paragraph = schema.nodes.paragraph!.create(null, typed ? schema.text(typed) : null)
  const chain = props.editor.chain().command(({ tr }) => {
    tr.replaceWith(pos, pos + size(pos), paragraph)
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
  const pos = position()
  if (pos === null) return
  saving.value = true
  if (next) nextLine()
  const event = await actions.create({ ...line, date: date.value, repeat: null, until: null })
  saving.value = false
  if (position() === null) return
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

/** A click anywhere on the line being typed puts the cursor at the end of what's typed. */
function onDraftDown(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('input') || !input.value) return
  event.preventDefault()
  input.value.focus()
  input.value.setSelectionRange(input.value.value.length, input.value.value.length)
}

function onBlur() {
  // Saving, or already turned back into text.
  if (saving.value || eventRef.value || position() === null) return
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
    <div
      v-if="!eventRef"
      class="flex min-h-8 cursor-text items-center gap-2.5"
      @mousedown="onDraftDown"
    >
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
      goes-on
      @updated="onUpdated"
      @removed="remove"
      @enter="nextLine"
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
