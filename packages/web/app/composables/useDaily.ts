// Daily notes (shared/calendar.ts): opening a day's note, which the server creates when the day
// has none (one call, so that two windows or an agent never make two). The note page drops it
// again when it is left empty (pages/notes/[id].vue). From one day to another, the day shows in
// the same tab (unlike pages, which each get theirs).
import { addDays, calendarDateOf, isoDate } from '@tandem/shared'
import { noteIdOf } from '~/utils/tabs'

export function useDaily() {
  const api = useApi()
  const tree = useTree()
  const showError = useApiErrorToast()
  const tabs = useTabs()
  const { settings } = useSettings()

  /** The day shown in the active tab, if it shows one. */
  const activeDay = computed(() => {
    const id = noteIdOf(tabs.activeKey.value ?? '')
    const node = id ? tree.byId.value.get(id) : undefined
    return node && settings.value.daily ? calendarDateOf(node.path) : null
  })

  async function open(date = isoDate(), options: { replace?: boolean } = {}) {
    try {
      const node = await unwrap(api.calendar[':date'].$post({ param: { date } }))
      // Its Calendar folder may be new too.
      if (!tree.byId.value.has(node.id)) await tree.refresh()
      const path = `/notes/${node.id}`
      if (activeDay.value && !options.replace) await tabs.replace(path)
      else await navigateTo(path, { replace: options.replace })
    } catch (error) {
      showError(error, 'Could not open this day')
    }
  }

  // The day on its way, for keys pressed faster than days open: each counts from the last.
  const pending = useState<string | null>('daily:pending', () => null)

  /** The day before or after the one shown (⌥⌘← ⌥⌘→, ‹ ›). */
  async function step(days: number) {
    const from = pending.value ?? activeDay.value
    if (!from) return
    const day = addDays(from, days)
    pending.value = day
    await open(day)
    if (pending.value === day) pending.value = null
  }

  return { open, step, activeDay }
}
