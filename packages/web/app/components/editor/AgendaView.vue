<script setup lang="ts">
// A day's agenda block: the day's events (useAgendaDays), one line each: a checkbox, the time
// label in its calendar's color (a click opens its details), the title edited in place (Enter
// or leaving it saves, Escape puts it back). The last line, "Add event", reads what is typed
// (`14:00 Standup`, `13:30-14:30 Lunch`, or a title for all day), the label showing live.
// A day without events shows nothing, unless an event is being added (`/event`).
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { timeLabel, type AgendaItem } from '@tandem/shared'
import type { EventFields } from '~/composables/useAgenda'
import { CHOICE_COLOR_STYLES } from '~/utils/choice-colors'
import AgendaEventForm from './AgendaEventForm.vue'

const props = defineProps(nodeViewProps)

const date = computed(() => (props.extension.options.date as () => string | null)())
const editable = computed(() => props.editor.isEditable)
const { items, patchItem, reload } = useAgendaDays(() =>
  date.value ? { from: date.value, to: date.value } : null,
)
const actions = useAgendaActions()
const selected = useBlockSelected(props.editor, () => props.selected)

// `/event` asks for the add line of this day's block (editor/agenda.ts's `focusAgenda`).
const focus = useAgendaFocus()
const adding = ref(false)
const addInput = useTemplateRef<HTMLInputElement>('addInput')
watch(
  () => focus.value,
  async (request) => {
    if (!request || request.date !== date.value) return
    focus.value = null
    adding.value = true
    await nextTick()
    addInput.value?.focus()
  },
  { immediate: true },
)

const visible = computed(() => !!date.value && (items.value.length > 0 || adding.value))

function labelClass(item: AgendaItem) {
  return item.color ? CHOICE_COLOR_STYLES[item.color].tag : 'bg-primary/10 text-primary'
}

// --- Adding ----------------------------------------------------------------------------------

const draft = useEventDraft()

async function add() {
  const line = draft.line.value
  if (!line.title || !date.value) return
  const fields: EventFields = { ...line, date: date.value, repeat: null, until: null }
  if (!(await actions.create(fields))) return
  draft.clear()
  // Shown before the add line is left (which, on a day still without events, removes the block).
  await reload()
}

/** Leaving the add line: on a day with no events, the block goes with it. */
function stopAdding() {
  if (draft.text.value.trim() || draft.time.value) return
  adding.value = false
  if (items.value.length) return
  const pos = props.getPos()
  if (typeof pos === 'number' && editable.value) {
    props.editor.chain().setNodeSelection(pos).deleteSelection().focus().run()
  }
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

// --- Editing ---------------------------------------------------------------------------------

async function toggle(item: AgendaItem, checked: boolean) {
  patchItem(item.key, { checked })
  await actions.setChecked(item, checked)
}

async function saveTitle(item: AgendaItem, input: HTMLInputElement) {
  const title = input.value.replace(/\s+/g, ' ').trim()
  if (!title || title === item.title) {
    input.value = item.title
    return
  }
  if (await actions.update(item, { title })) patchItem(item.key, { title })
  else input.value = item.title
}

function onTitleKey(event: KeyboardEvent, item: AgendaItem) {
  const input = event.target as HTMLInputElement
  if (event.key === 'Enter') {
    event.preventDefault()
    input.blur()
  } else if (event.key === 'Escape') {
    input.value = item.title
    input.blur()
  }
}

const openKey = ref<string | null>(null)

async function saveDetails(item: AgendaItem, fields: Partial<EventFields>) {
  openKey.value = null
  await actions.update(item, fields)
}

async function remove(item: AgendaItem) {
  openKey.value = null
  await actions.remove(item)
}
</script>

<template>
  <NodeViewWrapper
    class="agenda-block"
    :class="[visible ? 'my-3' : 'hidden', selected && 'is-selected']"
    contenteditable="false"
    data-testid="agenda"
    :data-date="date"
  >
    <!-- Not a list: the editor's lists are indented, these lines start where the text does. -->
    <div v-if="visible" class="space-y-0.5" role="list">
      <div
        v-for="item in items"
        :key="item.key"
        class="group flex min-h-8 items-center gap-2.5"
        role="listitem"
        data-testid="agenda-event"
      >
        <UCheckbox
          :model-value="item.checked"
          :disabled="!editable"
          :aria-label="`Done: ${item.title}`"
          @update:model-value="(value) => void toggle(item, value === true)"
        />
        <UPopover
          :open="openKey === item.key"
          :content="{ align: 'start' }"
          @update:open="(open) => (openKey = open ? item.key : null)"
        >
          <button
            type="button"
            class="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums transition-opacity"
            :class="[labelClass(item), item.checked && 'opacity-50']"
            :disabled="!editable && !item.feedId"
            data-testid="agenda-time"
          >
            {{ timeLabel(item) }}
          </button>
          <template #content>
            <AgendaEventForm
              :item="item"
              @save="(fields) => void saveDetails(item, fields)"
              @remove="() => void remove(item)"
              @close="openKey = null"
            />
          </template>
        </UPopover>
        <input
          :value="item.title"
          class="min-w-0 flex-1 bg-transparent outline-none"
          :class="item.checked && 'text-muted line-through'"
          :readonly="!editable || !!item.feedId"
          :aria-label="`Title: ${item.title}`"
          data-testid="agenda-title"
          @keydown="(event) => onTitleKey(event, item)"
          @blur="(event) => void saveTitle(item, event.target as HTMLInputElement)"
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
      </div>
      <div v-if="editable" class="flex min-h-8 items-center gap-2.5 text-muted" role="listitem">
        <UIcon name="i-lucide-plus" class="size-4 shrink-0" />
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
          class="min-w-0 flex-1 bg-transparent text-default outline-none placeholder:text-dimmed"
          :placeholder="draft.time.value ? 'Title' : 'Add event: 14:00 Standup'"
          aria-label="Add event"
          data-testid="agenda-add"
          @input="draft.input(($event.target as HTMLInputElement).value)"
          @focus="adding = true"
          @keydown="onAddKey"
          @blur="stopAdding"
        />
      </div>
    </div>
  </NodeViewWrapper>
</template>
