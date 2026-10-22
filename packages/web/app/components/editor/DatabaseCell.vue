<script setup lang="ts">
// A database cell, edited in place with the control of its column's type: native fields for
// text, numbers and checkboxes (a table can have hundreds of rows), Nuxt UI's for dates and
// choices (as everywhere else in the app). A value is saved when it is committed (Enter,
// leaving the cell, a pick), not at each keystroke; the server checks it. While a cell is
// being edited it keeps what is typed: the table reloads with every change (yours, an
// agent's), which would otherwise put the saved value back under the cursor.
import { cellText, requiresValue, type CellValue, type DatabaseColumn } from '@tandem/shared'
import DatabaseDate from '~/components/editor/DatabaseDate.vue'

const props = defineProps<{
  column: DatabaseColumn
  value: CellValue | undefined
  readonly: boolean
  /** Saves a value; false when it was refused (the cell shows the saved one again). */
  save: (value: CellValue) => Promise<boolean>
}>()

// Numbers are French (dates have their own field, DatabaseDate).
const shown = computed(() => cellText(props.value, props.column))

const draft = ref(shown.value)
const editing = ref(false)
watch(shown, (value) => {
  if (!editing.value) draft.value = value
})

async function commit(text: string) {
  if (text === shown.value) return
  if (!(await props.save(text === '' ? null : text)) && !editing.value) draft.value = shown.value
}

function onInput(event: Event) {
  draft.value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
}

function onBlur() {
  editing.value = false
  void commit(draft.value)
}

/**
 * Enter commits (by leaving the cell), Escape puts the value back. In text cells, Shift+Enter
 * starts a new line (not while an input method composes: its Enter picks a word).
 */
function onKey(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement | HTMLTextAreaElement
  if (event.key === 'Enter' && !event.isComposing) {
    if (event.shiftKey && input instanceof HTMLTextAreaElement) return
    event.preventDefault()
    input.blur()
  } else if (event.key === 'Escape') {
    draft.value = shown.value
    input.blur()
  }
}

// Nuxt UI's select can't have an empty value: "no choice" is an item of its own.
const NONE = '\u0000none'
const choices = computed(() => {
  const items = (props.column.options ?? []).map((option) => ({ label: option, value: option }))
  // A value that is no longer a choice (renamed or removed): shown as it is.
  if (draft.value && !props.column.options?.includes(draft.value)) {
    items.push({ label: draft.value, value: draft.value })
  }
  return requiresValue(props.column) ? items : [{ label: '—', value: NONE }, ...items]
})

function pick(value: unknown) {
  draft.value = value === NONE ? '' : String(value ?? '')
  void commit(draft.value)
}

const label = computed(() => props.column.name)
</script>

<template>
  <input
    v-if="column.type === 'checkbox'"
    type="checkbox"
    class="database-checkbox"
    :checked="Boolean(value)"
    :disabled="readonly"
    :aria-label="label"
    @change="save(($event.target as HTMLInputElement).checked)"
  />
  <USelect
    v-else-if="column.type === 'select'"
    :model-value="draft || undefined"
    :items="choices"
    placeholder="—"
    variant="none"
    size="sm"
    class="database-select w-full"
    :disabled="readonly"
    :aria-label="label"
    @update:model-value="pick"
  />
  <DatabaseDate
    v-else-if="column.type === 'date'"
    :model-value="typeof value === 'string' ? value : null"
    :label="label"
    :readonly="readonly"
    @update:model-value="save"
  />
  <!-- Text wraps and grows with its lines: a hidden copy of it (::after) sizes the cell. -->
  <div v-else-if="column.type === 'text'" class="database-text" :data-value="draft">
    <textarea
      class="database-input"
      rows="1"
      :value="draft"
      :readonly="readonly"
      :aria-label="label"
      @focus="editing = true"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKey"
    />
  </div>
  <input
    v-else
    type="text"
    class="database-input text-end tabular-nums"
    inputmode="decimal"
    :value="draft"
    :readonly="readonly"
    :aria-label="label"
    @focus="editing = true"
    @input="onInput"
    @blur="onBlur"
    @keydown="onKey"
  />
</template>
