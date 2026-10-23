<script setup lang="ts">
// The filters of a database view, in a popover: rows show when they match every condition.
// Each change is saved at once (the view is saved with the database).
import type { CellValue, DatabaseColumn, DatabaseFilter, FilterOperator } from '@tandem/shared'
import DatabaseDate from '~/components/editor/DatabaseDate.vue'
import { choiceTagClass } from '~/utils/choice-colors'

const props = defineProps<{
  columns: DatabaseColumn[]
  filters: DatabaseFilter[]
  readonly: boolean
}>()
const emit = defineEmits<{ update: [filters: DatabaseFilter[]] }>()

const open = defineModel<boolean>('open', { default: false })

const columnOf = (filter: DatabaseFilter) => props.columns.find((c) => c.id === filter.column)
const needsValue = (filter: DatabaseFilter) =>
  filter.operator !== 'empty' && filter.operator !== 'not-empty'

function replace(index: number, filter: DatabaseFilter) {
  emit(
    'update',
    props.filters.map((current, i) => (i === index ? filter : current)),
  )
}

function setColumn(index: number, columnId: string) {
  const column = props.columns.find((c) => c.id === columnId)
  if (column) replace(index, defaultFilter(column))
}

function setOperator(index: number, operator: FilterOperator) {
  replace(index, { ...props.filters[index]!, operator })
}

function setValue(index: number, value: CellValue) {
  replace(index, { ...props.filters[index]!, value: value === '' ? null : value })
}

function remove(index: number) {
  emit(
    'update',
    props.filters.filter((_, i) => i !== index),
  )
}

/** A new condition, on `column` (from a column's menu) or the first column. */
function add(column?: DatabaseColumn) {
  const target = column ?? props.columns[0]
  if (target) emit('update', [...props.filters, defaultFilter(target)])
  open.value = true
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-list-filter"
      :label="filters.length ? `Filters (${filters.length})` : 'Filter'"
      size="xs"
      :color="filters.length ? 'primary' : 'neutral'"
      :variant="filters.length ? 'soft' : 'ghost'"
    />
    <template #content>
      <div class="flex w-[min(28rem,90vw)] flex-col gap-2 p-3" data-testid="database-filters">
        <p v-if="!filters.length" class="text-sm text-muted">No filter: every row shows.</p>
        <div v-for="(filter, index) in filters" :key="index" class="flex items-center gap-1.5">
          <USelect
            :model-value="filter.column"
            :items="columns.map((c) => ({ label: c.name, value: c.id }))"
            size="xs"
            class="w-28"
            :disabled="readonly"
            aria-label="Column"
            @update:model-value="(value) => setColumn(index, String(value))"
          />
          <USelect
            :model-value="filter.operator"
            :items="FILTER_CONDITIONS[columnOf(filter)?.type ?? 'text']"
            size="xs"
            class="w-28"
            :disabled="readonly"
            aria-label="Condition"
            @update:model-value="(value) => setOperator(index, value as FilterOperator)"
          />
          <template v-if="needsValue(filter) && columnOf(filter)">
            <USelect
              v-if="columnOf(filter)!.type === 'checkbox'"
              :model-value="filter.value ? 'yes' : 'no'"
              :items="[
                { label: 'checked', value: 'yes' },
                { label: 'not checked', value: 'no' },
              ]"
              size="xs"
              class="min-w-0 flex-1"
              :disabled="readonly"
              aria-label="Value"
              @update:model-value="(value) => setValue(index, value === 'yes')"
            />
            <USelect
              v-else-if="columnOf(filter)!.type === 'select'"
              :model-value="String(filter.value ?? '')"
              :items="columnOf(filter)!.options ?? []"
              size="xs"
              class="min-w-0 flex-1"
              :disabled="readonly"
              aria-label="Value"
              @update:model-value="(value) => setValue(index, String(value))"
            >
              <template #item-label="{ item }">
                <span :class="choiceTagClass(columnOf(filter)!.colors?.[String(item)])">{{
                  item
                }}</span>
              </template>
            </USelect>
            <DatabaseDate
              v-else-if="columnOf(filter)!.type === 'date'"
              :model-value="typeof filter.value === 'string' ? filter.value : null"
              label="Value"
              :readonly="readonly"
              size="xs"
              variant="outline"
              class="min-w-0 flex-1"
              @update:model-value="(value) => setValue(index, value)"
            />
            <!-- Holds what is typed (the filters reload with every change): set on change. -->
            <UInput
              v-else
              :key="`${index}-${filter.column}-${filter.operator}`"
              :default-value="String(filter.value ?? '')"
              size="xs"
              class="min-w-0 flex-1"
              :disabled="readonly"
              aria-label="Value"
              @change="(event: Event) => setValue(index, (event.target as HTMLInputElement).value)"
            />
          </template>
          <span v-else class="flex-1" />
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Remove the filter"
            :disabled="readonly"
            @click="remove(index)"
          />
        </div>
        <UButton
          v-if="!readonly"
          icon="i-lucide-plus"
          label="Add a filter"
          size="xs"
          color="neutral"
          variant="ghost"
          class="self-start"
          @click="add()"
        />
      </div>
    </template>
  </UPopover>
</template>
