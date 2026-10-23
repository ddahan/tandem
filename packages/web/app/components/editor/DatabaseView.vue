<script setup lang="ts">
// A database block: its title, its view (filters, sort: saved with the database), and the
// table, edited in place. The data is in SQLite (useDatabase); the note only names it.
import type { DropdownMenuItem } from '@nuxt/ui'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import {
  COLUMN_TYPES,
  COLUMN_WIDTH,
  viewRows,
  hasChoices,
  withCents,
  type CellValue,
  type ColumnType,
  type DatabaseColumn,
} from '@tandem/shared'
import type { ColumnChange } from '~/composables/useDatabase'
import DatabaseCell from '~/components/editor/DatabaseCell.vue'
import DatabaseChoices from '~/components/editor/DatabaseChoices.vue'
import DatabaseFilters from '~/components/editor/DatabaseFilters.vue'
import { BLOCK_WIDTHS } from '~/utils/block-widths'
import { keysText } from '~/utils/platform-keys'

const props = defineProps(nodeViewProps)

const id = computed(() => String(props.node.attrs.id ?? ''))
const {
  database,
  missing,
  setTitle,
  setColumns,
  setSort,
  setFilters,
  addRow,
  setCell,
  moveRow,
  deleteRow,
} = useDatabase(id)
const toast = useToast()
const table = ref<HTMLTableElement | null>(null)

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
// Money columns showing cents: decided on every row, not only those the filters show.
const cents = computed(
  () =>
    new Set(
      (database.value?.columns ?? [])
        .filter((column) => withCents(column, database.value!.rows))
        .map((column) => column.id),
    ),
)

const TYPES: Record<ColumnType, { label: string; icon: string }> = {
  text: { label: 'Text', icon: 'i-lucide-type' },
  number: { label: 'Number', icon: 'i-lucide-hash' },
  money: { label: 'Money (€)', icon: 'i-lucide-euro' },
  date: { label: 'Date', icon: 'i-lucide-calendar' },
  checkbox: { label: 'Checkbox', icon: 'i-lucide-square-check' },
  select: { label: 'Choice', icon: 'i-lucide-circle-chevron-down' },
  multiselect: { label: 'Multiple choices', icon: 'i-lucide-list-checks' },
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
  (title, old) => {
    if (!editingTitle.value || titleDraft.value === (old ?? '')) titleDraft.value = title ?? ''
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
    await setColumns(
      columnsWith(column.id, (c) => ({ ...c, name })),
      'Rename a column',
    )
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
  const ok = await setColumns(
    [...columnsWith(null, (c) => c), { name, type: 'text' }],
    'Add a column',
  )
  if (ok) renaming.value = database.value?.columns.at(-1)?.id ?? null
}

function move(column: DatabaseColumn, by: -1 | 1) {
  const columns = columnsWith(null, (c) => c)
  const index = columns.findIndex((c) => c.id === column.id)
  const target = index + by
  if (target < 0 || target >= columns.length) return
  ;[columns[index], columns[target]] = [columns[target]!, columns[index]!]
  void setColumns(columns, 'Move a column')
}

/** Deletes a column and its values, without asking: ⌘Z brings them back. */
async function removeColumn(column: DatabaseColumn) {
  await setColumns(
    columnsWith(column.id, () => null),
    'Delete a column',
  )
}

/** A choice typed in a cell's menu, added at the end of its column's (false: refused). */
async function addChoice(column: DatabaseColumn, name: string) {
  return setColumns(
    columnsWith(column.id, (c) => ({ ...c, options: [...(c.options ?? []), name] })),
    'Add a choice',
  )
}

// Choices of a choice column, in DatabaseChoices.
const choicesOf = ref<DatabaseColumn | null>(null)
function editChoices(column: DatabaseColumn) {
  choicesOf.value = column
}
async function saveChoices(change: Pick<DatabaseColumn, 'options' | 'colors' | 'allowEmpty'>) {
  const column = choicesOf.value
  if (!column) return
  choicesOf.value = null
  await setColumns(
    columnsWith(column.id, (c) => ({ ...c, ...change })),
    'Edit the choices',
  )
}

const filtersOpen = ref(false)
// "Filter" in a column's menu: the condition is added, and the filters open, once the menu has
// closed (opened sooner, the popover closes again as the menu gives the focus back).
let filterOn: DatabaseColumn | null = null
function onMenuClosed(event: Event) {
  if (!filterOn || !database.value) return
  event.preventDefault()
  const column = filterOn
  filterOn = null
  void setFilters([...database.value.filters, defaultFilter(column)])
  filtersOpen.value = true
}

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
              void setColumns(
                // Between one choice and several, the choices stay.
                columnsWith(column.id, (c) =>
                  hasChoices(c) && hasChoices({ type })
                    ? { ...c, type }
                    : { ...c, type, options: undefined, colors: undefined },
                ),
                'Change a column’s type',
              )
            }
          },
        })),
      },
      ...(hasChoices(column)
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
        onSelect: () => (filterOn = column),
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

// --- Widths ----------------------------------------------------------------------------------

// Columns have a width (a default for their type until resized): the table is as wide as its
// columns (no column filling what is left), scrolling when the page is narrower.
const DEFAULT_WIDTHS: Record<ColumnType, number> = {
  text: 200,
  number: 110,
  money: 130,
  date: 160,
  checkbox: 90,
  select: 160,
  multiselect: 220,
}
/** The first column usually names the row: more room. */
const FIRST_WIDTH = 260
/** The "Add a column" button, after the table. */
const ADD_COLUMN_WIDTH = 32

/** While a column is resized: its width, not saved yet. */
const resizing = ref<{ id: string; width: number } | null>(null)

function widthOf(column: DatabaseColumn) {
  if (resizing.value?.id === column.id) return resizing.value.width
  if (column.width) return column.width
  return database.value?.columns[0]?.id === column.id ? FIRST_WIDTH : DEFAULT_WIDTHS[column.type]
}

const tableWidth = computed(() =>
  (database.value?.columns ?? []).reduce((sum, c) => sum + widthOf(c), 0),
)

/** Drags the edge of a column's heading; the width is saved when it is let go. */
function startResize(event: PointerEvent, column: DatabaseColumn) {
  if (readonly.value || event.button !== 0) return
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  const startX = event.clientX
  const start = widthOf(column)
  resizing.value = { id: column.id, width: start }
  const onMove = (pointer: PointerEvent) => {
    const width = Math.round(start + pointer.clientX - startX)
    resizing.value = {
      id: column.id,
      width: Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, width)),
    }
  }
  const onUp = async () => {
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onUp)
    const width = resizing.value?.width ?? start
    // Kept until saved: the column doesn't jump back to its old width meanwhile.
    if (width !== start) {
      await setColumns(
        columnsWith(column.id, (c) => ({ ...c, width })),
        'Resize a column',
      )
    }
    resizing.value = null
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
}

/** A double-click on the edge: back to the default width. */
function resetWidth(column: DatabaseColumn) {
  if (readonly.value || column.width === undefined) return
  void setColumns(
    columnsWith(column.id, (c) => ({ ...c, width: undefined })),
    'Resize a column',
  )
}

// The note's page goes full width while a table is wider than its text (see notes/[id].vue).
const blockWidths = inject(BLOCK_WIDTHS, null)
const widthKey = Symbol('database')
watch(
  () => (database.value ? tableWidth.value + ADD_COLUMN_WIDTH : 0),
  (width) => blockWidths?.set(widthKey, width),
  { immediate: true },
)
onBeforeUnmount(() => blockWidths?.delete(widthKey))

const sortedBy = computed(() => {
  const sort = database.value?.sort
  const column = sort && database.value?.columns.find((c) => c.id === sort.column)
  return column ? { name: column.name, direction: sort!.direction } : null
})

// --- Rows ------------------------------------------------------------------------------------

/** Deletes a row, without asking: ⌘Z brings it back. */
async function removeRow(rowId: string) {
  await deleteRow(rowId)
}

/** Puts the cursor in a row's cell (its column's position), once the table shows it. */
async function focusCell(rowId: string, column: number) {
  await nextTick()
  const row = table.value?.querySelector(`tr[data-row-id="${CSS.escape(rowId)}"]`)
  // A date's first part (day), not its calendar button.
  row?.children[column]
    ?.querySelector<HTMLElement>('textarea, input, [role="spinbutton"], button')
    ?.focus()
}

/** Adds a row right below another, the cursor in its first cell. */
async function insertBelow(rowId: string) {
  const before = new Set(database.value?.rows.map((row) => row.id))
  if (!(await addRow(rowId))) return
  const added = database.value?.rows.find((row) => !before.has(row.id))
  if (added) await focusCell(added.id, 0)
}

/**
 * Moves a row one place up or down among the rows shown: before the one above it, after the
 * one below (rows hidden by the filters in between keep their place). The cursor stays in its
 * cell. A sorted table has no order of its own to change.
 */
async function moveRowBy(rowId: string, by: -1 | 1, column: number) {
  const current = database.value
  if (!current) return
  if (current.sort) {
    toast.add({
      title: 'The table is sorted',
      description: 'Stop sorting it to move rows.',
      icon: 'i-lucide-arrow-down-up',
      color: 'neutral',
    })
    return
  }
  const shown = rows.value
  const neighbour = shown[shown.findIndex((row) => row.id === rowId) + by]
  if (!neighbour) return
  const others = current.rows.map((row) => row.id).filter((other) => other !== rowId)
  const after = by === 1 ? neighbour.id : (others[others.indexOf(neighbour.id) - 1] ?? null)
  if (await moveRow(rowId, after)) await focusCell(rowId, column)
}

/** ⌘Enter in a cell adds a row below (the value is saved first), ⌥↑ / ⌥↓ move the row. */
function onRowKey(event: KeyboardEvent, rowId: string) {
  if (readonly.value || event.isComposing) return
  const cell = (event.target as HTMLElement).closest('td')
  const column = cell ? [...cell.parentElement!.children].indexOf(cell) : 0
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
    event.preventDefault()
    // The cell saves its value as it loses the focus: before the row is added (see useDatabase).
    ;(event.target as HTMLElement).blur()
    void insertBelow(rowId)
  } else if (
    (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
    event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey
  ) {
    event.preventDefault()
    ;(event.target as HTMLElement).blur()
    void moveRowBy(rowId, event.key === 'ArrowUp' ? -1 : 1, column)
  }
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
          v-model:open="filtersOpen"
          :columns="database.columns"
          :filters="database.filters"
          :readonly="readonly"
          @update="setFilters"
        />
      </div>

      <!-- The rows' buttons are on their start side: in the page's margin from sm up, room is
           kept for them below. -->
      <div class="database-scroll overflow-x-auto ps-11 sm:-ms-11">
        <div class="flex w-max items-start">
          <div class="rounded-md border border-default">
            <table ref="table" class="database-table" :style="{ width: `${tableWidth}px` }">
              <colgroup>
                <col
                  v-for="column in database.columns"
                  :key="column.id"
                  :style="{ width: `${widthOf(column)}px` }"
                />
              </colgroup>
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
                      :content="{ align: 'start', onCloseAutoFocus: onMenuClosed }"
                    >
                      <button type="button" class="database-heading">
                        <UIcon
                          :name="TYPES[column.type].icon"
                          class="size-3.5 shrink-0 text-dimmed"
                        />
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
                    <div
                      v-if="!readonly"
                      class="database-resize"
                      :class="resizing?.id === column.id && 'is-resizing'"
                      role="separator"
                      aria-orientation="vertical"
                      :aria-label="`Resize ${column.name}`"
                      title="Drag to resize, double-click for the default width"
                      @pointerdown="startResize($event, column)"
                      @dblclick="resetWidth(column)"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in rows"
                  :key="row.id"
                  :data-row-id="row.id"
                  data-testid="database-row"
                  @keydown="onRowKey($event, row.id)"
                >
                  <td v-for="(column, index) in database.columns" :key="column.id">
                    <DatabaseCell
                      :column="column"
                      :value="row.cells[column.id]"
                      :cents="cents.has(column.id)"
                      :readonly="readonly"
                      :save="(value: CellValue) => setCell(row.id, column.id, value)"
                      :add-choice="readonly ? undefined : (name: string) => addChoice(column, name)"
                    />
                    <!-- After the cell's field: the first thing to focus in the cell is the field. -->
                    <div v-if="index === 0 && !readonly" class="database-row-actions">
                      <UButton
                        icon="i-lucide-plus"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        class="p-0.5"
                        aria-label="Insert a row below"
                        :title="`Insert a row below (${keysText('⌘↵')})`"
                        @click="insertBelow(row.id)"
                      />
                      <UButton
                        icon="i-lucide-x"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        class="p-0.5"
                        aria-label="Delete the row"
                        title="Delete the row"
                        @click="removeRow(row.id)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <UButton
            v-if="!readonly"
            icon="i-lucide-plus"
            size="xs"
            color="neutral"
            variant="ghost"
            class="ms-1 mt-1"
            aria-label="Add a column"
            @click="addColumn"
          />
        </div>
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

      <DatabaseChoices :column="choicesOf" @close="choicesOf = null" @save="saveChoices" />
    </template>
  </NodeViewWrapper>
</template>
