<script setup lang="ts">
// "New event…" (the palette): an event for any day, typed on one line as in an agenda block
// (`14:00 Standup`, `13:30-14:30 Lunch`, or a title for all day), the label showing live.
import { dayLabel, parseEventLine, timeLabel } from '@tandem/shared'
import DatabaseDate from '~/components/editor/DatabaseDate.vue'

const props = defineProps<{ date: string }>()
const emit = defineEmits<{ close: [added: boolean] }>()

const actions = useAgendaActions()
const daily = useDaily()
const toast = useToast()
const date = ref<string | null>(props.date)
const text = ref('')
const line = computed(() => parseEventLine(text.value))

async function add() {
  const day = date.value
  if (!line.value.title || !day) return
  if (!(await actions.create({ ...line.value, date: day, repeat: null, until: null }))) return
  toast.add({
    title: `Added to ${dayLabel(day).title}`,
    icon: 'i-lucide-calendar-check',
    actions: [{ label: 'Open the day', onClick: () => void daily.open(day) }],
  })
  emit('close', true)
}
</script>

<template>
  <UModal title="New event" @update:open="(open) => !open && emit('close', false)">
    <template #body>
      <form class="space-y-3" @submit.prevent="add">
        <UFormField label="Day" size="sm">
          <DatabaseDate v-model="date" label="Day" variant="outline" />
        </UFormField>
        <UFormField
          label="Event"
          size="sm"
          hint="14:00 Standup · 13:30-14:30 Lunch · a title for all day"
        >
          <UInput
            v-model="text"
            autofocus
            class="w-full"
            aria-label="Event"
            data-testid="new-event"
          >
            <template v-if="line.title" #leading>
              <span
                class="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-medium text-primary tabular-nums"
              >
                {{ timeLabel(line) }}
              </span>
            </template>
          </UInput>
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('close', false)" />
          <UButton type="submit" label="Add" :disabled="!line.title || !date" />
        </div>
      </form>
    </template>
  </UModal>
</template>
