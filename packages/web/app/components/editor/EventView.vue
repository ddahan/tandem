<script setup lang="ts">
// An event placed in the note (editor/event.ts): its line (AgendaLine), from the day's events.
// Being typed (no ref yet), it is a line where the time becomes the label (useEventDraft): Enter,
// or leaving it with a title, saves the event (Enter then goes on to a new line below); Escape,
// or leaving it without a title, turns it back into the text typed. Backspace in an empty line
// removes it. Changed to another day, or deleted, its block goes; a day taken out of a repeat
// (a new event) keeps its place.
import { TextSelection } from '@tiptap/pm/state'
import { canJoin } from '@tiptap/pm/transform'
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

// The block's own element, to find it in the note.
const wrapper = useTemplateRef<{ $el?: Element }>('wrapper')

/**
 * This block's position in the note, or null once it's gone: the event block whose element is
 * this one's. The node view's own position (and node) can lag behind the document.
 */
function position(): number | null {
  const { state, view } = props.editor
  const el = wrapper.value?.$el
  let found: number | null = null
  if (el) {
    state.doc.descendants((node, pos) => {
      if (found !== null) return false
      if (node.type.name !== 'event') return true
      const dom = view.nodeDOM(pos)
      if (dom && (dom === el || dom.contains(el))) found = pos
      return false
    })
  }
  if (found !== null) return found
  const pos = props.getPos()
  return typeof pos === 'number' && state.doc.nodeAt(pos)?.type.name === 'event' ? pos : null
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

function isList(node: { type: { name: string } } | null | undefined): boolean {
  return node?.type.name === 'taskList'
}

/** Whether the block sits beside a to-do list (it reads as one of its to-dos). */
function besideTodos(pos: number): { before: boolean; after: boolean } {
  const { doc } = props.editor.state
  const $pos = doc.resolve(pos)
  const after = doc.nodeAt(pos + size(pos))
  return {
    before: $pos.nodeBefore?.type.name === 'taskList',
    after: after?.type.name === 'taskList',
  }
}

/**
 * On to the line below, as a to-do's Enter: beside to-dos, a new empty to-do (at the start of
 * the list below, or in a list of its own); elsewhere a new empty line (an empty line there
 * already takes it). The cursor in it.
 */
function nextLine() {
  const pos = position()
  if (pos === null) return
  const { state, view } = props.editor
  const { schema } = state
  const after = pos + size(pos)
  const next = state.doc.nodeAt(after)
  const tr = state.tr
  let cursor = after + 1
  const todos = besideTodos(pos)
  if (todos.before || todos.after) {
    const todo = schema.nodes.taskItem!.create({ checked: false }, schema.nodes.paragraph!.create())
    // Inside the list below (its first to-do), or a list of its own.
    if (todos.after) tr.insert(after + 1, todo)
    else tr.insert(after, schema.nodes.taskList!.create(null, todo))
    cursor = after + 3
  } else if (!(next?.type.name === 'paragraph' && next.content.size === 0)) {
    tr.insert(after, schema.nodes.paragraph!.create())
  }
  // The field left first: the editor, around it, can't take the focus from it. Then at once,
  // so that the next keys typed land on the new line (and next frame again, as TipTap does).
  const active = document.activeElement
  if (active instanceof HTMLElement && view.dom.contains(active) && active !== view.dom)
    active.blur()
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, cursor)).scrollIntoView())
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

/**
 * Back to what was typed, as text (the cursor at its end, unless `focus` is false): a to-do
 * again, joined to the lists beside it, when it was one.
 */
function toText(focus = true) {
  const pos = position()
  if (pos === null) return
  const time = draft.time.value
  const typed = `${time ? `${time.end ? `${time.start}-${time.end}` : time.start} ` : ''}${draft.text.value}`
  const { state, view } = props.editor
  const { schema } = state
  const paragraph = schema.nodes.paragraph!.create(null, typed ? schema.text(typed) : null)
  const tr = state.tr
  const wasTodo = !!props.editor.state.doc.nodeAt(pos)?.attrs.todo
  let end: number
  if (wasTodo) {
    const list = schema.nodes.taskList!.create(
      null,
      schema.nodes.taskItem!.create({ checked: false }, paragraph),
    )
    tr.replaceWith(pos, pos + size(pos), list)
    // The text's end: inside the list, its to-do and its line.
    end = pos + 3 + typed.length
    // Joined to the to-do lists beside it (only those: an empty line could be joined too).
    const listEnd = pos + list.nodeSize
    if (isList(tr.doc.resolve(listEnd).nodeAfter) && canJoin(tr.doc, listEnd)) tr.join(listEnd)
    if (isList(tr.doc.resolve(pos).nodeBefore) && canJoin(tr.doc, pos)) {
      tr.join(pos)
      end -= 2
    }
  } else {
    tr.replaceWith(pos, pos + size(pos), paragraph)
    end = pos + 1 + typed.length
  }
  if (focus) tr.setSelection(TextSelection.create(tr.doc, end))
  view.dispatch(tr)
  if (focus) view.focus()
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
    ref="wrapper"
    class="event-block"
    :class="selected && 'is-selected'"
    contenteditable="false"
    data-testid="event-block"
    :data-event="eventRef"
  >
    <!-- As a to-do's line (AgendaLine's): its checkbox, there from the start. -->
    <div v-if="!eventRef" class="event-line cursor-text" @mousedown="onDraftDown">
      <input
        type="checkbox"
        class="event-check pointer-events-none"
        aria-hidden="true"
        tabindex="-1"
      />
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
