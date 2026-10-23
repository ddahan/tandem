<script setup lang="ts">
// Settings › Features › Calendar feeds (daily notes on): `.ics` addresses whose events show,
// read-only, in the days' agendas. Each has a name and a color; Tandem reads them every half
// hour, or now with Refresh. One that can't be read keeps its last events and says why.
import { CHOICE_COLORS, formatDateTime, type AgendaFeed, type ChoiceColor } from '@tandem/shared'
import { CHOICE_COLOR_STYLES } from '~/utils/choice-colors'

const api = useApi()
const showError = useApiErrorToast()

const feeds = ref<AgendaFeed[]>([])
async function load() {
  feeds.value = await unwrap(api.agenda.feeds.$get()).catch(() => feeds.value)
}
onMounted(load)
useServerEvents((event) => {
  if (event.type === 'agenda' || event.type === 'resync') void load()
})

const colors = CHOICE_COLORS.map((color) => ({
  value: color,
  label: CHOICE_COLOR_STYLES[color].label,
  chip: { class: CHOICE_COLOR_STYLES[color].dot },
}))

// --- Adding ----------------------------------------------------------------------------------

const adding = ref(false)
const name = ref('')
const url = ref('')
const saving = ref(false)

async function add() {
  if (!url.value.trim()) return
  saving.value = true
  try {
    const feed = await unwrap(
      api.agenda.feeds.$post({ json: { name: name.value, url: url.value } }),
    )
    name.value = ''
    url.value = ''
    adding.value = false
    await load()
    if (feed.error) showError(new Error(feed.error), `${feed.name} was added, but can’t be read`)
  } catch (error) {
    showError(error, 'Could not add the calendar')
  } finally {
    saving.value = false
  }
}

// --- Each feed -------------------------------------------------------------------------------

const refreshing = ref<string | null>(null)
async function refresh(feed: AgendaFeed) {
  refreshing.value = feed.id
  try {
    await unwrap(api.agenda.feeds[':id'].refresh.$post({ param: { id: feed.id } }))
    await load()
  } catch (error) {
    showError(error, 'Could not read the calendar')
  } finally {
    refreshing.value = null
  }
}

async function change(feed: AgendaFeed, patch: { name?: string; color?: ChoiceColor }) {
  if (patch.name !== undefined && (!patch.name.trim() || patch.name === feed.name)) return
  try {
    await unwrap(api.agenda.feeds[':id'].$patch({ param: { id: feed.id }, json: patch }))
    await load()
  } catch (error) {
    showError(error, 'Could not change the calendar')
  }
}

const confirm = useConfirm()
async function remove(feed: AgendaFeed) {
  const ok = await confirm({
    title: `Remove ${feed.name}?`,
    description: 'Its events leave the agenda. The calendar itself isn’t changed.',
    confirmLabel: 'Remove',
    confirmColor: 'error',
  })
  if (!ok) return
  try {
    await unwrap(api.agenda.feeds[':id'].$delete({ param: { id: feed.id } }))
    await load()
  } catch (error) {
    showError(error, 'Could not remove the calendar')
  }
}

function status(feed: AgendaFeed) {
  if (feed.error) return feed.error
  if (!feed.fetchedAt) return 'Not read yet'
  return `${feed.events} event${feed.events === 1 ? '' : 's'}, read ${formatDateTime(feed.fetchedAt)}`
}
</script>

<template>
  <div class="space-y-3" data-testid="calendar-feeds">
    <ul v-if="feeds.length" class="divide-y divide-default rounded-md border border-default">
      <li
        v-for="feed in feeds"
        :key="feed.id"
        class="flex items-center gap-3 px-3 py-2"
        data-testid="calendar-feed"
      >
        <USelect
          :model-value="feed.color"
          :items="colors"
          value-key="value"
          variant="ghost"
          size="xs"
          class="shrink-0"
          :aria-label="`Color of ${feed.name}`"
          :ui="{ base: 'px-2', value: 'sr-only', placeholder: 'sr-only', trailing: 'hidden' }"
          @update:model-value="(color) => void change(feed, { color: color as ChoiceColor })"
        >
          <template #leading>
            <span class="block size-3 rounded-full" :class="CHOICE_COLOR_STYLES[feed.color].dot" />
          </template>
        </USelect>
        <div class="min-w-0 flex-1">
          <input
            :value="feed.name"
            class="w-full truncate bg-transparent text-sm font-medium text-highlighted outline-none"
            :aria-label="`Name of ${feed.name}`"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
            @blur="(event) => void change(feed, { name: (event.target as HTMLInputElement).value })"
          />
          <p
            class="truncate text-xs"
            :class="feed.error ? 'text-error' : 'text-muted'"
            :title="feed.url"
          >
            {{ status(feed) }}
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="xs"
          :loading="refreshing === feed.id"
          :aria-label="`Refresh ${feed.name}`"
          @click="refresh(feed)"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`Remove ${feed.name}`"
          @click="remove(feed)"
        />
      </li>
    </ul>
    <form v-if="adding" class="space-y-2" @submit.prevent="add">
      <UInput v-model="name" placeholder="Name (Work, Holidays…)" size="sm" class="w-full" />
      <UInput
        v-model="url"
        placeholder="https://…/calendar.ics or webcal://…"
        size="sm"
        class="w-full"
        autofocus
        aria-label="Calendar address"
      />
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="adding = false" />
        <UButton type="submit" label="Add" size="sm" :loading="saving" :disabled="!url.trim()" />
      </div>
    </form>
    <UButton
      v-else
      label="Add a calendar"
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="sm"
      @click="adding = true"
    />
  </div>
</template>
