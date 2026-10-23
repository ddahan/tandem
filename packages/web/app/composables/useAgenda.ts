// The agenda of daily notes (shared/agenda.ts): the events of some days, kept up to date with
// the server's changes, and what can be done to them. A repeating event asks which days a change
// is for (that one, or all from today on); a deletion can be undone for a few seconds.
import {
  checkRef,
  parseEventLine,
  timeAlone,
  typedTime,
  type AgendaEvent,
  type AgendaItem,
  type AgendaUndoInput,
  type Repeat,
} from '@tandem/shared'
import AgendaScopeDialog from '~/components/AgendaScopeDialog.vue'

export interface EventFields {
  title: string
  date: string
  start: string | null
  end: string | null
  repeat: Repeat | null
  until: string | null
}

/** The days' events, shared by everything showing the same days (an agenda, its placed events). */
interface AgendaCache {
  items: Ref<AgendaItem[]>
  loaded: Ref<boolean>
  loading: Promise<void> | null
}
const caches = new Map<string, AgendaCache>()

function cacheOf(key: string): AgendaCache {
  let cache = caches.get(key)
  if (!cache) {
    cache = { items: ref([]), loaded: ref(false), loading: null }
    caches.set(key, cache)
  }
  return cache
}

/** The events of the days from `range().from` to `range().to` (none while it's null). */
export function useAgendaDays(range: () => { from: string; to: string } | null) {
  const api = useApi()
  const key = computed(() => {
    const current = range()
    return current ? `${current.from}/${current.to}` : null
  })
  const empty = ref<AgendaItem[]>([])
  const items = computed(() => (key.value ? cacheOf(key.value).items.value : empty.value))
  const loaded = computed(() => (key.value ? cacheOf(key.value).loaded.value : false))

  /** Reads the days again; asked by several views at once, once. */
  function load(): Promise<void> {
    const current = range()
    if (!current || !key.value) return Promise.resolve()
    const cache = cacheOf(key.value)
    cache.loading ??= unwrap(api.agenda.$get({ query: current }))
      .then((list) => {
        cache.items.value = list
        cache.loaded.value = true
      })
      .catch(() => {})
      .finally(() => (cache.loading = null))
    return cache.loading
  }

  watch(key, () => void load(), { immediate: true })
  useServerEvents((event) => {
    if (event.type === 'agenda' || event.type === 'resync') void load()
  })

  /** Shows a change at once, before the server's answer (which reloads the days). */
  function patchItem(itemKey: string, change: Partial<AgendaItem>) {
    if (!key.value) return
    const cache = cacheOf(key.value)
    const index = cache.items.value.findIndex((item) => item.key === itemKey)
    const item = cache.items.value[index]
    if (!item) return
    cache.items.value = cache.items.value.toSpliced(index, 1, { ...item, ...change })
  }

  return { items, loaded, reload: load, patchItem }
}

export function useAgendaActions() {
  const api = useApi()
  const toast = useToast()
  const showError = useApiErrorToast()
  const overlay = useOverlay()
  const scopeDialog = overlay.create(AgendaScopeDialog)

  /** For a repeating event: this day only, or all from today on (null: cancelled). */
  async function scopeOf(item: AgendaItem, action: 'change' | 'delete') {
    if (!item.repeat) return {}
    const scope = (await scopeDialog.open({ action }).result) as 'one' | 'all' | null
    return scope ? { on: item.date, scope } : null
  }

  /** A new event; null when refused. */
  async function create(fields: EventFields): Promise<AgendaEvent | null> {
    try {
      return await unwrap(api.agenda.events.$post({ json: fields }))
    } catch (error) {
      showError(error, 'Could not add the event')
      return null
    }
  }

  /**
   * Changes an event: the event that has the change (another one when a day of a repeating event
   * was taken out of it, or its days from today on), or null when it wasn't (cancelled, refused).
   */
  async function update(
    item: AgendaItem,
    patch: Partial<EventFields>,
  ): Promise<AgendaEvent | null> {
    if (item.feedId) return null
    const where = await scopeOf(item, 'change')
    if (!where) return null
    try {
      const { event } = await unwrap(
        api.agenda.events[':id'].$patch({ param: { id: item.id }, json: { ...patch, ...where } }),
      )
      return event
    } catch (error) {
      showError(error, 'Could not change the event')
      return null
    }
  }

  async function restore(undo: AgendaUndoInput) {
    try {
      await unwrap(api.agenda.restore.$post({ json: undo }))
    } catch (error) {
      showError(error, 'Could not bring the event back')
    }
  }

  async function remove(item: AgendaItem): Promise<boolean> {
    if (item.feedId) return false
    const where = await scopeOf(item, 'delete')
    if (!where) return false
    try {
      const undo = await unwrap(
        api.agenda.events[':id'].$delete({ param: { id: item.id }, query: where }),
      )
      toast.add({
        title: 'Event deleted',
        icon: 'i-lucide-calendar-x',
        actions: [{ label: 'Undo', icon: 'i-lucide-undo-2', onClick: () => void restore(undo) }],
      })
      return true
    } catch (error) {
      showError(error, 'Could not delete the event')
      return false
    }
  }

  async function setChecked(item: AgendaItem, checked: boolean) {
    try {
      await unwrap(
        api.agenda.checks.$put({ json: { ref: checkRef(item), date: item.date, checked } }),
      )
    } catch (error) {
      showError(error, 'Could not check the event')
    }
  }

  return { create, update, remove, setChecked }
}

/**
 * An event being typed on one line (`14h Standup`): its time, once typed, leaves the text for
 * the label in front of it (a space then the title, or Tab), so it isn't written twice. Backspace
 * at the start of the text puts it back to edit. `13:30 - 14:30` stays text until the title
 * starts: a dash after the first time is the range going on.
 */
export function useEventDraft() {
  const text = ref('')
  const time = ref<{ start: string; end: string | null } | null>(null)

  /** What the line says: its time (the label's, or one still typed) and title. */
  const line = computed(() => {
    if (time.value) return { ...time.value, title: text.value.replace(/\s+/g, ' ').trim() }
    return parseEventLine(text.value)
  })

  function input(value: string) {
    text.value = value
    if (time.value) return
    const typed = typedTime(value)
    if (typed) {
      time.value = { start: typed.start, end: typed.end }
      text.value = typed.title
    }
  }

  /** Tab after a time alone makes it the label; Backspace on an empty text edits it again. */
  function keydown(event: KeyboardEvent) {
    const target = event.target as HTMLInputElement
    const alone = event.key === 'Tab' && !event.shiftKey && !time.value && timeAlone(text.value)
    if (alone) {
      event.preventDefault()
      time.value = alone
      text.value = ''
    } else if (
      event.key === 'Backspace' &&
      time.value &&
      target.selectionStart === 0 &&
      target.selectionEnd === 0
    ) {
      event.preventDefault()
      const label = time.value.end ? `${time.value.start}-${time.value.end}` : time.value.start
      time.value = null
      text.value = `${label}${text.value ? ` ${text.value}` : ''}`
      void nextTick(() => target.setSelectionRange(label.length, label.length))
    }
  }

  function clear() {
    text.value = ''
    time.value = null
  }

  return { text, time, line, input, keydown, clear }
}
