// The agenda of daily notes (shared/agenda.ts): the events of some days, kept up to date with
// the server's changes, and what can be done to them. A repeating event asks which days a change
// is for (that one, or all from today on); a deletion can be undone for a few seconds.
import { checkRef, type AgendaItem, type AgendaUndoInput, type Repeat } from '@tandem/shared'
import AgendaScopeDialog from '~/components/AgendaScopeDialog.vue'

export interface EventFields {
  title: string
  date: string
  start: string | null
  end: string | null
  repeat: Repeat | null
  until: string | null
}

/** The events of the days from `range().from` to `range().to` (none while it's null). */
export function useAgendaDays(range: () => { from: string; to: string } | null) {
  const api = useApi()
  const items = ref<AgendaItem[]>([])
  const loaded = ref(false)
  let asked = 0

  async function load() {
    const current = range()
    if (!current) {
      items.value = []
      return
    }
    const ticket = ++asked
    const list = await unwrap(api.agenda.$get({ query: current })).catch(() => null)
    // A newer range (another day) asked for meanwhile wins.
    if (!list || ticket !== asked) return
    items.value = list
    loaded.value = true
  }

  watch(
    () => JSON.stringify(range()),
    () => void load(),
    { immediate: true },
  )
  useServerEvents((event) => {
    if (event.type === 'agenda' || event.type === 'resync') void load()
  })

  /** Shows a change at once, before the server's answer (which reloads the days). */
  function patchItem(key: string, change: Partial<AgendaItem>) {
    items.value = items.value.map((item) => (item.key === key ? { ...item, ...change } : item))
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

  async function create(fields: EventFields): Promise<boolean> {
    try {
      await unwrap(api.agenda.events.$post({ json: fields }))
      return true
    } catch (error) {
      showError(error, 'Could not add the event')
      return false
    }
  }

  /** Changes an event; false when it wasn't (cancelled, or refused). */
  async function update(item: AgendaItem, patch: Partial<EventFields>): Promise<boolean> {
    if (item.feedId) return false
    const where = await scopeOf(item, 'change')
    if (!where) return false
    try {
      await unwrap(
        api.agenda.events[':id'].$patch({ param: { id: item.id }, json: { ...patch, ...where } }),
      )
      return true
    } catch (error) {
      showError(error, 'Could not change the event')
      return false
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

/** A request for a day's agenda block to start adding an event (`/event`, editor/agenda.ts). */
export function useAgendaFocus() {
  return useState<{ date: string } | null>('agenda:focus', () => null)
}
