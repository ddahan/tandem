<script setup lang="ts">
// A database cell, edited in place with the control of its column's type. Native controls:
// a table can have hundreds of rows. A value is saved when it is committed (Enter, leaving
// the cell, a pick), not at each keystroke; the server checks it. While a cell is being
// edited it keeps what is typed: the table reloads with every change (yours, an agent's),
// which would otherwise put the saved value back under the cursor.
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
  draft.value = (event.target as HTMLInputElement).value
}

function onBlur() {
  editing.value = false
  void commit(draft.value)
}

/** Enter commits (by leaving the cell), Escape puts the value back. */
function onKey(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  if (event.key === 'Enter') input.blur()
  else if (event.key === 'Escape') {
    draft.value = shown.value
    input.blur()
  }
}

function pick(event: Event) {
  draft.value = (event.target as HTMLSelectElement).value
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
  <select
    v-else-if="column.type === 'select'"
    class="database-input"
    :class="!draft && 'text-dimmed'"
    :value="draft"
    :disabled="readonly"
    :aria-label="label"
    @change="pick"
  >
    <option v-if="!requiresValue(column)" value="">—</option>
    <option v-for="option in column.options ?? []" :key="option" :value="option">
      {{ option }}
    </option>
    <!-- A value that is no longer a choice (renamed or removed): shown as it is. -->
    <option v-if="draft && !column.options?.includes(draft)" :value="draft">{{ draft }}</option>
  </select>
  <DatabaseDate
    v-else-if="column.type === 'date'"
    :model-value="typeof value === 'string' ? value : null"
    :label="label"
    :readonly="readonly"
    @update:model-value="save"
  />
  <input
    v-else
    type="text"
    class="database-input"
    :class="column.type === 'number' && 'text-end tabular-nums'"
    :inputmode="column.type === 'number' ? 'decimal' : undefined"
    :value="draft"
    :readonly="readonly"
    :aria-label="label"
    @focus="editing = true"
    @input="onInput"
    @blur="onBlur"
    @keydown="onKey"
  />
</template>
