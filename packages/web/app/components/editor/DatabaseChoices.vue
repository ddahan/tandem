<script setup lang="ts">
// The choices of a `select` column, edited in a modal: one line per choice, with its color (none
// by default), its name, and buttons to move or remove it; whether a value is required. Nothing
// is saved before "Save". A renamed choice keeps its color: colors go with the line, not the name.
import { CHOICE_COLORS, type ChoiceColor, type DatabaseColumn } from '@tandem/shared'
import { CHOICE_COLOR_STYLES, choiceTagClass } from '~/utils/choice-colors'

const props = defineProps<{ column: DatabaseColumn | null }>()
const emit = defineEmits<{
  close: []
  save: [change: Pick<DatabaseColumn, 'options' | 'colors' | 'allowEmpty'>]
}>()

interface Line {
  key: number
  name: string
  color?: ChoiceColor
}

let keys = 0
const lines = ref<Line[]>([])
const allowEmpty = ref(true)
const list = ref<HTMLElement | null>(null)

watch(
  () => props.column,
  (column) => {
    if (!column) return
    lines.value = (column.options ?? []).map((name) => ({
      key: keys++,
      name,
      color: column.colors?.[name],
    }))
    if (!lines.value.length) lines.value.push({ key: keys++, name: '' })
    allowEmpty.value = column.allowEmpty !== false
  },
  { immediate: true },
)

/** A new empty choice after `index` (at the end without one), the cursor in it. */
async function add(index = lines.value.length - 1) {
  lines.value.splice(index + 1, 0, { key: keys++, name: '' })
  await nextTick()
  list.value?.querySelectorAll('input')[index + 1]?.focus()
}

function move(index: number, by: number) {
  const [line] = lines.value.splice(index, 1)
  lines.value.splice(index + by, 0, line!)
}

function remove(index: number) {
  lines.value.splice(index, 1)
}

function pickColor(line: Line, color: ChoiceColor | undefined, close: () => void) {
  line.color = color
  close()
}

// Enter adds the next choice (not while an input method composes: its Enter picks a word).
function onKey(event: KeyboardEvent, index: number) {
  if (event.key !== 'Enter' || event.isComposing) return
  event.preventDefault()
  void add(index)
}

function save() {
  const options: string[] = []
  const colors: Record<string, ChoiceColor> = {}
  for (const line of lines.value) {
    const name = line.name.trim()
    if (!name || options.includes(name)) continue
    options.push(name)
    if (line.color) colors[name] = line.color
  }
  emit('save', { options, colors, allowEmpty: allowEmpty.value })
}

const COLOR_ITEMS = [
  { value: undefined, label: 'No color' },
  ...CHOICE_COLORS.map((color) => ({ value: color, label: CHOICE_COLOR_STYLES[color].label })),
]
</script>

<template>
  <UModal
    :open="column !== null"
    :title="`Choices of “${column?.name}”`"
    description="In the order the menu shows them."
    @update:open="(open) => !open && emit('close')"
  >
    <template #body>
      <div class="space-y-4">
        <ul ref="list" class="space-y-1.5" aria-label="Choices">
          <li v-for="(line, index) in lines" :key="line.key" class="flex items-center gap-1.5">
            <UPopover>
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                square
                :aria-label="`Color of ${line.name || 'this choice'}: ${line.color ? CHOICE_COLOR_STYLES[line.color].label : 'none'}`"
              >
                <span
                  class="block size-3.5 rounded-full"
                  :class="
                    line.color
                      ? CHOICE_COLOR_STYLES[line.color].dot
                      : 'border border-dashed border-accented'
                  "
                />
              </UButton>
              <template #content="{ close }">
                <div class="grid grid-cols-2 gap-0.5 p-1" role="listbox" aria-label="Colors">
                  <button
                    v-for="item in COLOR_ITEMS"
                    :key="item.label"
                    type="button"
                    role="option"
                    :aria-selected="line.color === item.value"
                    class="flex items-center gap-2 rounded px-2 py-1 text-start text-sm hover:bg-elevated"
                    :class="{ 'bg-elevated': line.color === item.value }"
                    @click="pickColor(line, item.value, close)"
                  >
                    <span
                      class="block size-3.5 shrink-0 rounded-full"
                      :class="
                        item.value
                          ? CHOICE_COLOR_STYLES[item.value].dot
                          : 'border border-dashed border-accented'
                      "
                    />
                    <span :class="choiceTagClass(item.value)">{{ item.label }}</span>
                  </button>
                </div>
              </template>
            </UPopover>
            <UInput
              v-model="line.name"
              size="sm"
              class="min-w-0 flex-1"
              placeholder="Name of the choice"
              :aria-label="`Choice ${index + 1}`"
              @keydown="onKey($event, index)"
            />
            <UButton
              icon="i-lucide-arrow-up"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="index === 0"
              :aria-label="`Move ${line.name || 'this choice'} up`"
              @click="move(index, -1)"
            />
            <UButton
              icon="i-lucide-arrow-down"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="index === lines.length - 1"
              :aria-label="`Move ${line.name || 'this choice'} down`"
              @click="move(index, 1)"
            />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`Remove ${line.name || 'this choice'}`"
              @click="remove(index)"
            />
          </li>
        </ul>
        <UButton
          icon="i-lucide-plus"
          label="Add a choice"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="add()"
        />
        <UCheckbox
          v-model="allowEmpty"
          label="Allow empty"
          :description="
            allowEmpty
              ? 'A cell can be left without a choice.'
              : 'Every row has a choice: new rows start with the first one, empty cells take it now, and a cell can\'t be emptied.'
          "
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('close')" />
        <UButton label="Save" @click="save" />
      </div>
    </template>
  </UModal>
</template>
