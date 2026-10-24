<script setup lang="ts">
// A time for events: Nuxt UI's time field, typed hour then minute (24 h), with a list of times
// every quarter of an hour in a popover, as the day field has its calendar (DatabaseDate).
// Values are `HH:MM` strings, as the server keeps them.
import { Time } from '@internationalized/date'

const props = defineProps<{ modelValue: string; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function text(hours: number, minutes: number) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const value = computed<Time | undefined>({
  get: () => {
    const [hours = 0, minutes = 0] = props.modelValue.split(':').map(Number)
    return new Time(hours, minutes)
  },
  set: (time) => {
    if (time) emit('update:modelValue', text(time.hour, time.minute))
  },
})

const TIMES = Array.from({ length: 96 }, (_, i) => text(Math.floor(i / 4), (i % 4) * 15))

const open = ref(false)
const list = useTemplateRef<HTMLElement>('list')
// The list opens on the time shown (or the quarter before it).
watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  const [hours = 0, minutes = 0] = props.modelValue.split(':').map(Number)
  const quarter = text(hours, Math.floor(minutes / 15) * 15)
  list.value?.querySelector(`[data-time="${quarter}"]`)?.scrollIntoView({ block: 'center' })
})

function pick(time: string) {
  emit('update:modelValue', time)
  open.value = false
}
</script>

<template>
  <UInputTime
    v-model="value"
    :hour-cycle="24"
    granularity="minute"
    locale="en-GB"
    size="sm"
    :aria-label="label"
    class="w-full"
  >
    <template #trailing>
      <UPopover v-model:open="open">
        <UButton
          icon="i-lucide-clock"
          color="neutral"
          variant="link"
          size="sm"
          class="px-0"
          :aria-label="`Pick a time: ${label}`"
        />
        <template #content>
          <div ref="list" class="max-h-56 w-24 overflow-y-auto p-1" role="listbox">
            <button
              v-for="time in TIMES"
              :key="time"
              type="button"
              role="option"
              :aria-selected="time === modelValue"
              :data-time="time"
              class="block w-full rounded px-2 py-1 text-start font-mono text-sm tabular-nums hover:bg-elevated"
              :class="time === modelValue && 'bg-primary/10 text-primary'"
              @click="pick(time)"
            >
              {{ time }}
            </button>
          </div>
        </template>
      </UPopover>
    </template>
  </UInputTime>
</template>
