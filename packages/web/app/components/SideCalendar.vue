<script setup lang="ts">
// The side panel's calendar (daily notes on): a month, weeks from Monday with their ISO number,
// each day marked when its note has something written (a dot), to-dos left (a ring) or only
// to-dos done (a check). A click opens the day's note (created when it has none).
import { isMac } from '~/utils/platform-keys'
import { keysHere } from '~/utils/shortcuts'
import { addDays, dateOf, isoDate, isoWeek, monthLabel, type CalendarDay } from '@tandem/shared'

const props = defineProps<{
  /** The day shown in the note, if the note is one. */
  date: string | null
}>()

const api = useApi()
const daily = useDaily()

const today = ref(isoDate())
// Past midnight, today moves (the window may stay open for days).
const timer = setInterval(() => (today.value = isoDate()), 60_000)
onScopeDispose(() => clearInterval(timer))

function monthOf(iso: string) {
  const date = dateOf(iso)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}
const shown = ref(monthOf(props.date ?? today.value))
watch(
  () => props.date,
  (date) => {
    if (date) shown.value = monthOf(date)
  },
)
const monthKey = computed(() => `${shown.value.year}-${String(shown.value.month).padStart(2, '0')}`)

function step(months: number) {
  const date = new Date(shown.value.year, shown.value.month - 1 + months, 1)
  shown.value = { year: date.getFullYear(), month: date.getMonth() + 1 }
}

// --- The month's days and their marks --------------------------------------------------------

const days = ref(new Map<string, CalendarDay>())
async function load() {
  const key = monthKey.value
  const list = await unwrap(api.calendar.$get({ query: { month: key } })).catch(() => null)
  if (list && key === monthKey.value) days.value = new Map(list.map((day) => [day.date, day]))
}
watch(monthKey, load, { immediate: true })
let reload: ReturnType<typeof setTimeout> | undefined
useServerEvents((event) => {
  if (!['note', 'tree', 'resync'].includes(event.type)) return
  // Typing saves often: once it settles.
  clearTimeout(reload)
  reload = setTimeout(() => void load(), 400)
})
onScopeDispose(() => clearTimeout(reload))

/** Rows of 7 days, Monday first, covering the month. */
const weeks = computed(() => {
  const first = `${monthKey.value}-01`
  // Back to the Monday of the first week.
  let day = addDays(first, -((dateOf(first).getDay() + 6) % 7))
  const rows: { week: number; days: string[] }[] = []
  do {
    const row = Array.from({ length: 7 }, (_, i) => addDays(day, i))
    rows.push({ week: isoWeek(day), days: row })
    day = addDays(day, 7)
  } while (day.startsWith(monthKey.value))
  return rows
})

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// As in Docs › Shortcuts (utils/shortcuts.ts), in one line: the modifiers and one key for any
// arrow (← → a day, ↑ ↓ a week), one shortcut: ⌥⌘ in the installed app's window, ⌃⌥ in a
// browser tab (there, ⌥⌘← ⌥⌘→ switch the browser's tabs). Both work in the app.
const appWindow = useAppWindow()
const mac = isMac()
const KEYS = computed(() =>
  [
    {
      label: 'Navigate days and weeks',
      appKeys: [['meta', 'alt', 'arrows']],
      keys: [['ctrl', 'alt', 'arrows']],
    },
  ].map((hint) => ({ label: hint.label, keys: keysHere(hint, appWindow.value, mac).slice(0, 1) })),
)

function marksOf(iso: string) {
  const day = days.value.get(iso)
  return {
    written: !!day?.written,
    open: (day?.open ?? 0) > 0,
    done: (day?.done ?? 0) > 0 && !day?.open,
  }
}
function labelOf(iso: string) {
  const marks = marksOf(iso)
  const notes = [
    marks.written && 'written',
    marks.open && 'to-dos left',
    marks.done && 'to-dos done',
  ].filter(Boolean)
  const date = dateOf(iso)
  return `${date.getDate()} ${monthLabel(date.getFullYear(), date.getMonth() + 1)}${notes.length ? `: ${notes.join(', ')}` : ''}`
}
</script>

<template>
  <div class="space-y-3" data-testid="side-calendar">
    <div class="flex items-center gap-1">
      <h3 class="min-w-0 flex-1 truncate ps-1 text-sm font-semibold text-highlighted">
        {{ monthLabel(shown.year, shown.month) }}
      </h3>
      <UButton
        v-if="date !== today || !monthKey.startsWith(today.slice(0, 7))"
        label="Today"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="daily.open()"
      />
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Previous month"
        @click="step(-1)"
      />
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Next month"
        @click="step(1)"
      />
    </div>

    <table class="w-full table-fixed border-separate border-spacing-y-0.5 text-center text-xs">
      <thead>
        <tr class="text-dimmed">
          <th class="w-7 font-medium text-primary" title="Calendar week">CW</th>
          <th v-for="weekday in WEEKDAYS" :key="weekday" class="pb-1 font-medium">
            {{ weekday }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in weeks" :key="row.week + row.days[0]!">
          <td class="text-[11px] text-primary/80 tabular-nums">{{ row.week }}</td>
          <td v-for="day in row.days" :key="day" class="p-0">
            <button
              type="button"
              class="mx-auto flex h-9 w-full max-w-9 flex-col items-center justify-start rounded-md pt-1 tabular-nums transition-colors hover:bg-elevated"
              :class="[
                day === date
                  ? 'bg-primary/15 font-semibold text-primary hover:bg-primary/20'
                  : day === today
                    ? 'font-semibold text-primary'
                    : day.startsWith(monthKey)
                      ? 'text-default'
                      : 'text-dimmed',
              ]"
              :aria-label="labelOf(day)"
              :aria-current="day === date ? 'date' : undefined"
              :data-date="day"
              @click="daily.open(day)"
            >
              <span>{{ Number(day.slice(8)) }}</span>
              <span class="flex h-2 items-center gap-0.5" aria-hidden="true">
                <span
                  v-if="marksOf(day).written"
                  class="size-1 rounded-full bg-current opacity-70"
                />
                <span
                  v-if="marksOf(day).open"
                  class="size-1.5 rounded-full border border-current opacity-80"
                />
                <UIcon v-if="marksOf(day).done" name="i-lucide-check" class="size-2 opacity-80" />
              </span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- The keys that browse days, on a day's note: those that work here. -->
    <dl
      v-if="date"
      class="space-y-2 border-t border-default pt-3 text-xs text-muted"
      data-testid="calendar-keys"
    >
      <div v-for="hint in KEYS" :key="hint.label" class="flex items-center justify-between gap-2">
        <dt>{{ hint.label }}</dt>
        <dd><DocsKeys :keys="hint.keys" /></dd>
      </div>
    </dl>
  </div>
</template>
