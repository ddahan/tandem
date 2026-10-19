<script setup lang="ts">
// A database block: its title, its view (filters, sort: saved with the database), and the
// table, edited in place. The data is in SQLite (useDatabase); the note only names it.
import type { DropdownMenuItem } from '@nuxt/ui'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import {
  COLUMN_TYPES,
  viewRows,
  type CellValue,
  type ColumnType,
  type DatabaseColumn,
} from '@tandem/shared'
import type { ColumnChange } from '~/composables/useDatabase'
import DatabaseCell from '~/components/editor/DatabaseCell.vue'
import DatabaseFilters from '~/components/editor/DatabaseFilters.vue'

const props = defineProps(nodeViewProps)

const id = computed(() => String(props.node.attrs.id ?? ''))
const { database, missing, setTitle, setColumns, setSort, setFilters, addRow, setCell, deleteRow } =
  useDatabase(id)
const confirm = useConfirm()

const readonly = computed(() => !props.editor.isEditable)

// The frame shows the block selected as a whole (keyboard, handle). Working inside it (a date
// part, the calendar button) also selects it for the editor: no frame then, until it is no
// longer selected.
const touched = ref(false)
watch(
  () => props.selected,
  (selected) => {
    if (!selected) touched.value = false
  },
)
const framed = computed(() => props.selected && !touched.value)
const rows = computed(() => (database.value ? viewRows(database.value) : []))

const TYPES: Record<ColumnType, { label: string; icon: string }> = {
  text: { label: 'Text', icon: 'i-lucide-type' },
  number: { label: 'Number', icon: 'i-lucide-hash' },
  date: { label: 'Date', icon: 'i-lucide-calendar' },
  checkbox: { label: 'Checkbox', icon: 'i-lucide-square-check' },
  select: { label: 'Choice', icon: 'i-lucide-circle-chevron-down' },
}

/** The columns as the API takes them, with `change` applied to column `columnId`. */
function columnsWith(
  columnId: string | null,
  change: (column: ColumnChange) => ColumnChange | null,
) {
  const result: ColumnChange[] = []
  for (const column of database.value?.columns ?? []) {
    const changed = column.id === columnId ? change({ ...column }) : { ...column }
    if (changed) result.push(changed)
  }
  return result
}

// --- Title -----------------------------------------------------------------------------------

// While typed in, the title keeps what is typed (the database reloads with every change).
const titleDraft = ref('')
const editingTitle = ref(false)
watch(
  () => database.value?.title,
  (title) => {
    if (!editingTitle.value) titleDraft.value = title ?? ''
  },
  { immediate: true },
)

function saveTitle() {
  editingTitle.value = false
  const title = titleDraft.value.trim()
  if (database.value && title !== database.value.title) void setTitle(title)
}

// --- Columns ---------------------------------------------------------------------------------

const renaming = ref<string | null>(null)
const nameDraft = ref('')
watch(renaming, (columnId) => {
  nameDraft.value = database.value?.columns.find((c) => c.id === columnId)?.name ?? ''
})

async function rename(column: DatabaseColumn) {
  if (renaming.value !== column.id) return
  const name = nameDraft.value.trim()
  renaming.value = null
  if (name && name !== column.name)
    await setColumns(columnsWith(column.id, (c) => ({ ...c, name })))
}

/** The name field, once shown: focused, its text selected. */
function focusRename(element: unknown) {
  if (element instanceof HTMLInputElement && document.activeElement !== element) {
    element.focus()
    element.select()
  }
}

function onRenameKey(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  if (event.key === 'Enter') input.blur()
  else if (event.key === 'Escape') {
    renaming.value = null
  }
}

async function addColumn() {
  const names = new Set(database.value?.columns.map((c) => c.name.toLowerCase()))
  let name = 'Column'
  for (let n = 2; names.has(name.toLowerCase()); n++) name = `Column ${n}`
  const ok = await setColumns([...columnsWith(null, (c) => c), { name, type: 'text' }])
  if (ok) renaming.value = database.value?.columns.at(-1)?.id ?? null
}

function move(column: DatabaseColumn, by: -1 | 1) {
  const columns = columnsWith(null, (c) => c)
  const index = columns.findIndex((c) => c.id === column.id)
  const target = index + by
  if (target < 0 || target >= columns.length) return
  ;[columns[index], columns[target]] = [columns[target]!, columns[index]!]
  void setColumns(columns)
}

async function removeColumn(column: DatabaseColumn) {
  const used = database.value?.rows.some(
    (row) => row.cells[column.id] !== null && row.cells[column.id] !== undefined,
  )
  if (used) {
    const ok = await confirm({
      title: `Delete the column “${column.name}”?`,
      description: 'Its values in every row are deleted too.',
      confirmLabel: 'Delete',
      confirmColor: 'error',
      icon: 'i-lucide-trash-2',
    })
    if (!ok) return
  }
  await setColumns(columnsWith(column.id, () => null))
}

// Choices of a `select` column: one per line.
const choicesOf = ref<DatabaseColumn | null>(null)
const choicesText = ref('')
function editChoices(column: DatabaseColumn) {
  choicesOf.value = column
  choicesText.value = (column.options ?? []).join('\n')
}
async function saveChoices() {
  const column = choicesOf.value
  if (!column) return
  const options = choicesText.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  choicesOf.value = null
  await setColumns(columnsWith(column.id, (c) => ({ ...c, options })))
}

const filters = useTemplateRef<InstanceType<typeof DatabaseFilters>>('filters')
const filtersOpen = ref(false)

function columnMenu(column: DatabaseColumn): DropdownMenuItem[][] {
  const sort = database.value?.sort
  const first = database.value?.columns[0]?.id === column.id
  const last = database.value?.columns.at(-1)?.id === column.id
  return [
    [
      { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => (renaming.value = column.id) },
      {
        label: 'Type',
        icon: TYPES[column.type].icon,
        children: COLUMN_TYPES.map((type) => ({
          label: TYPES[type].label,
          icon: TYPES[type].icon,
          type: 'checkbox' as const,
          checked: column.type === type,
          onSelect: () => {
            if (type !== column.type) {
              void setColumns(columnsWith(column.id, (c) => ({ ...c, type, options: undefined })))
            }
          },
        })),
      },
      ...(column.type === 'select'
        ? [{ label: 'Edit choices…', icon: 'i-lucide-list', onSelect: () => editChoices(column) }]
        : []),
    ],
    [
      {
        label: 'Sort ascending',
        icon: 'i-lucide-arrow-up-narrow-wide',
        type: 'checkbox' as const,
        checked: sort?.column === column.id && sort.direction === 'asc',
        onSelect: () => void setSort({ column: column.id, direction: 'asc' }),
      },
      {
        label: 'Sort descending',
        icon: 'i-lucide-arrow-down-wide-narrow',
        type: 'checkbox' as const,
        checked: sort?.column === column.id && sort.direction === 'desc',
        onSelect: () => void setSort({ column: column.id, direction: 'desc' }),
      },
      {
        label: 'Filter',
        icon: 'i-lucide-list-filter',
        onSelect: () => filters.value?.add(column),
      },
    ],
    [
      ...(first
        ? []
        : [{ label: 'Move left', icon: 'i-lucide-arrow-left', onSelect: () => move(column, -1) }]),
      ...(last
        ? []
        : [{ label: 'Move right', icon: 'i-lucide-arrow-right', onSelect: () => move(column, 1) }]),
      ...((database.value?.columns.length ?? 0) > 1
        ? [
            {
              label: 'Delete',
              icon: 'i-lucide-trash-2',
              color: 'error' as const,
              onSelect: () => void removeColumn(column),
            },
          ]
        : []),
    ],
  ]
}

const sortedBy = computed(() => {
  const sort = database.value?.sort
  const column = sort && database.value?.columns.find((c) => c.id === sort.column)
  return column ? { name: column.name, direction: sort!.direction } : null
})

// --- Rows ------------------------------------------------------------------------------------

async function removeRow(rowId: string) {
  const row = database.value?.rows.find((r) => r.id === rowId)
  const used =
    row &&
    Object.values(row.cells).some((value) => value !== null && value !== undefined && value !== '')
  if (used) {
    const ok = await confirm({
      title: 'Delete this row?',
      description: 'Its values are deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      confirmColor: 'error',
      icon: 'i-lucide-trash-2',
    })
    if (!ok) return
  }
  await deleteRow(rowId)
}

const hidden = computed(() => (database.value?.rows.length ?? 0) - rows.value.length)
</script>

<template>
  <NodeViewWrapper
    class="database-block my-4"
    :class="framed && 'is-selected'"
    :data-database-id="id"
    contenteditable="false"
    @pointerdown="touched = true"
    data-testid="database"
  >
    <div
      v-if="missing"
      class="flex items-center gap-2 rounded-md border border-dashed border-default px-3 py-2 text-sm text-muted"
    >
      <UIcon name="i-lucide-database" class="size-4" />
      This database doesn't exist anymore.
    </div>
    <template v-else-if="database">
      <div class="mb-1.5 flex items-center gap-2">
        <UIcon name="i-lucide-database" class="size-4 shrink-0 text-dimmed" />
        <input
          :value="titleDraft"
          placeholder="Untitled database"
          aria-label="Database title"
          class="min-w-0 flex-1 bg-transparent font-semibold text-highlighted outline-none placeholder:text-dimmed"
          :readonly="readonly"
          @focus="editingTitle = true"
          @input="titleDraft = ($event.target as HTMLInputElement).value"
          @blur="saveTitle"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <UButton
          v-if="sortedBy"
          :icon="
            sortedBy.direction === 'asc'
              ? 'i-lucide-arrow-up-narrow-wide'
              : 'i-lucide-arrow-down-wide-narrow'
          "
          :label="sortedBy.name"
          trailing-icon="i-lucide-x"
          size="xs"
          color="primary"
          variant="soft"
          :aria-label="`Sorted by ${sortedBy.name}: stop sorting`"
          :disabled="readonly"
          @click="setSort(null)"
        />
        <DatabaseFilters
          ref="filters"
          v-model:open="filtersOpen"
          :columns="database.columns"
          :filters="database.filters"
          :readonly="readonly"
          @update="setFilters"
        />
      </div>

      <div class="overflow-x-auto rounded-md border border-default">
        <table class="database-table">
          <thead>
            <tr>
              <th v-for="column in database.columns" :key="column.id" scope="col">
                <input
                  v-if="renaming === column.id"
                  :ref="focusRename"
                  :value="nameDraft"
                  class="database-input font-medium"
                  aria-label="Column name"
                  @input="nameDraft = ($event.target as HTMLInputElement).value"
                  @blur="rename(column)"
                  @keydown="onRenameKey"
                />
                <UDropdownMenu
                  v-else
                  :items="columnMenu(column)"
                  :disabled="readonly"
                  :content="{ align: 'start' }"
                >
                  <button type="button" class="database-heading">
                    <UIcon :name="TYPES[column.type].icon" class="size-3.5 shrink-0 text-dimmed" />
                    <span class="truncate">{{ column.name }}</span>
                    <UIcon
                      v-if="database.sort?.column === column.id"
                      :name="
                        database.sort.direction === 'asc'
                          ? 'i-lucide-arrow-up'
                          : 'i-lucide-arrow-down'
                      "
                      class="size-3.5 shrink-0 text-primary"
                    />
                  </button>
                </UDropdownMenu>
              </th>
              <th class="w-8">
                <UButton
                  v-if="!readonly"
                  icon="i-lucide-plus"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Add a column"
                  @click="addColumn"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="group/row" data-testid="database-row">
              <td v-for="column in database.columns" :key="column.id">
                <DatabaseCell
                  :column="column"
                  :value="row.cells[column.id]"
                  :readonly="readonly"
                  :save="(value: CellValue) => setCell(row.id, column.id, value)"
                />
              </td>
              <td class="w-8">
                <UButton
                  v-if="!readonly"
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="opacity-0 group-hover/row:opacity-100 focus:opacity-100"
                  aria-label="Delete the row"
                  @click="removeRow(row.id)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-1 flex items-center gap-2 text-xs text-dimmed">
        <UButton
          v-if="!readonly"
          icon="i-lucide-plus"
          label="New row"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="addRow(database.rows.at(-1)?.id)"
        />
        <span v-if="hidden" class="ms-auto">{{ hidden }} hidden by the filters</span>
      </div>

      <UModal
        :open="choicesOf !== null"
        :title="`Choices of “${choicesOf?.name}”`"
        description="One per line, in order."
        @update:open="(open) => !open && (choicesOf = null)"
      >
        <template #body>
          <UTextarea
            v-model="choicesText"
            :rows="6"
            autoresize
            class="w-full"
            aria-label="Choices"
          />
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="choicesOf = null" />
            <UButton label="Save" @click="saveChoices" />
          </div>
        </template>
      </UModal>
    </template>
  </NodeViewWrapper>
</template>
