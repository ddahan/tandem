<script setup lang="ts">
// A date for databases (cells, filters): Nuxt UI's date field, typed segment by segment, with
// a calendar in a popover. Values are `2026-10-17` strings (what the server stores); shown as
// 17/10/2026, weeks starting on Monday (British English: French formats, English words).
import { parseDate, type CalendarDate } from '@internationalized/date'

const props = withDefaults(
  defineProps<{
    modelValue: string | null
    label: string
    readonly?: boolean
    size?: 'xs' | 'sm' | 'md'
    variant?: 'none' | 'outline'
  }>(),
  { readonly: false, size: 'sm', variant: 'none' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const LOCALE = 'en-GB'

const value = computed<CalendarDate | undefined>({
  get: () => {
    if (!props.modelValue) return undefined
    try {
      return parseDate(props.modelValue)
    } catch {
      return undefined
    }
  },
  set: (date) => {
    const next = date ? date.toString() : null
    if (next !== props.modelValue) emit('update:modelValue', next)
  },
})

const open = ref(false)
function pick(date: unknown) {
  value.value = (date as CalendarDate | undefined) ?? undefined
  open.value = false
}
</script>

<template>
  <UInputDate
    v-model="value"
    :locale="LOCALE"
    :size="size"
    :variant="variant"
    :disabled="readonly"
    :aria-label="label"
    class="database-date w-full"
    :ui="{
      base: 'gap-0',
      segment: 'data-[segment=day]:w-6 data-[segment=month]:w-6 data-[segment=year]:w-9',
    }"
  >
    <template #trailing>
      <UPopover v-model:open="open" :disabled="readonly">
        <UButton
          icon="i-lucide-calendar"
          color="neutral"
          variant="link"
          :size="size"
          class="px-0"
          :aria-label="`Pick a date: ${label}`"
          :disabled="readonly"
        />
        <template #content>
          <div class="flex flex-col gap-1 p-2">
            <UCalendar
              :model-value="value"
              :locale="LOCALE"
              :week-starts-on="1"
              size="sm"
              @update:model-value="pick"
            />
            <UButton
              v-if="value"
              label="Clear"
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              class="self-end"
              @click="pick(undefined)"
            />
          </div>
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
