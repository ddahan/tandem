<script setup lang="ts">
// An event's details, in the popover of its time label: all day, at a time, or from one time to
// another; its day (to move it); how it repeats, until when; deleting it. Saved with Save (or
// Enter), dropped with Escape. A feed's event is shown read-only, with its calendar.
import {
  REPEATS,
  REPEAT_LABELS,
  dayLabel,
  timeLabel,
  type AgendaItem,
  type Repeat,
} from '@tandem/shared'
import type { EventFields } from '~/composables/useAgenda'
import DatabaseDate from '~/components/editor/DatabaseDate.vue'
import AgendaTime from './AgendaTime.vue'

const props = defineProps<{ item: AgendaItem }>()
const emit = defineEmits<{ save: [fields: Partial<EventFields>]; remove: []; close: [] }>()

type Kind = 'day' | 'at' | 'range'
const kind = ref<Kind>(props.item.start ? (props.item.end ? 'range' : 'at') : 'day')
const start = ref(props.item.start ?? '09:00')
const end = ref(props.item.end ?? addHour(props.item.start ?? '09:00'))
const date = ref<string | null>(props.item.date)
const repeat = ref<Repeat | 'never'>(props.item.repeat ?? 'never')
const until = ref<string | null>(props.item.until)

function addHour(time: string) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return `${String(Math.min(23, hours + 1)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const KINDS: { value: Kind; label: string }[] = [
  { value: 'day', label: 'All day' },
  { value: 'at', label: 'At' },
  { value: 'range', label: 'From–to' },
]
const repeats = [
  { value: 'never', label: 'Never' },
  ...REPEATS.map((value) => ({ value, label: REPEAT_LABELS[value] })),
]

function save() {
  const fields: Partial<EventFields> = {
    start: kind.value === 'day' ? null : start.value || null,
    end: kind.value === 'range' ? end.value || null : null,
    repeat: repeat.value === 'never' ? null : repeat.value,
    until: repeat.value === 'never' ? null : until.value,
  }
  // The day moves only when it changed: for a repeating event, the day picked is that one's.
  if (date.value && date.value !== props.item.date) fields.date = date.value
  emit('save', fields)
}
</script>

<template>
  <div v-if="item.feedId" class="w-64 space-y-1 p-3 text-sm" data-testid="agenda-feed-event">
    <p class="font-medium text-highlighted">{{ item.title }}</p>
    <p class="text-muted">{{ dayLabel(item.date).title }} · {{ timeLabel(item) }}</p>
    <p class="flex items-center gap-1.5 text-xs text-muted">
      <UIcon name="i-lucide-rss" class="size-3.5" />
      From {{ item.calendar }}, read-only
    </p>
  </div>
  <form
    v-else
    class="w-72 space-y-3 p-3 text-sm"
    data-testid="agenda-event-form"
    @submit.prevent="save"
    @keydown.esc.stop="emit('close')"
  >
    <UFieldGroup class="w-full">
      <UButton
        v-for="option in KINDS"
        :key="option.value"
        :label="option.label"
        size="sm"
        class="flex-1 justify-center"
        :color="kind === option.value ? 'primary' : 'neutral'"
        :variant="kind === option.value ? 'subtle' : 'outline'"
        @click="kind = option.value"
      />
    </UFieldGroup>
    <div v-if="kind !== 'day'" class="flex items-center gap-2">
      <AgendaTime v-model="start" label="Start" class="flex-1" />
      <template v-if="kind === 'range'">
        <span class="text-muted">→</span>
        <AgendaTime v-model="end" label="End" class="flex-1" />
      </template>
    </div>
    <UFormField label="Day" size="sm">
      <DatabaseDate v-model="date" label="Day" variant="outline" />
    </UFormField>
    <UFormField label="Repeat" size="sm">
      <USelect
        v-model="repeat"
        :items="repeats"
        value-key="value"
        size="sm"
        class="w-full"
        aria-label="Repeat"
      />
    </UFormField>
    <UFormField v-if="repeat !== 'never'" label="Until" hint="Optional" size="sm">
      <DatabaseDate v-model="until" label="Until" variant="outline" />
    </UFormField>
    <div class="flex items-center gap-2 pt-1">
      <UButton
        label="Delete"
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="sm"
        @click="emit('remove')"
      />
      <span class="flex-1" />
      <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="emit('close')" />
      <UButton type="submit" label="Save" size="sm" />
    </div>
  </form>
</template>
