// Daily notes (shared/calendar.ts): opening a day's note, which the server creates when the day
// has none (one call, so that two windows or an agent never make two). The note page drops it
// again when it is left empty (pages/notes/[id].vue). From one day to another, the day shows in
// the same tab (unlike pages, which each get theirs).
import { addDays, calendarDateOf, isoDate } from '@tandem/shared'
import { noteIdOf } from '~/utils/tabs'

// Days asked for faster than they open (⌥⌘← pressed twice): the last one asked wins, whatever
// order the server answers in.
let latest = 0
// Steps through days, one at a time: a page switch started while the last one still loads can
// end on the earlier page (the router), so each waits for the day before it to show.
let steps: Promise<unknown> = Promise.resolve()

export function useDaily() {
  const api = useApi()
  const tree = useTree()
  const showError = useApiErrorToast()
  const tabs = useTabs()
  const { settings } = useSettings()
  const nuxtApp = useNuxtApp()

  /** Resolves once the next page shows (or after 3 s, whatever happens). */
  function nextPageShown() {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000)
      nuxtApp.hooks.hookOnce('page:finish', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  /** The day shown in the active tab, if it shows one. */
  const activeDay = computed(() => {
    const id = noteIdOf(tabs.activeKey.value ?? '')
    const node = id ? tree.byId.value.get(id) : undefined
    return node && settings.value.daily ? calendarDateOf(node.path) : null
  })

  /** Opens a day's note; false when it couldn't (or a newer day was asked for meanwhile). */
  async function open(date = isoDate(), options: { replace?: boolean } = {}): Promise<boolean> {
    try {
      const ticket = ++latest
      const node = await unwrap(api.calendar[':date'].$post({ param: { date } }))
      if (ticket !== latest) {
        // Skipped: made for nothing, it goes again (the server keeps it if it holds anything).
        void api.calendar[':id'].$delete({ param: { id: node.id } }).catch(() => {})
        return false
      }
      // Its Calendar folder may be new too.
      if (!tree.byId.value.has(node.id)) await tree.refresh()
      const path = `/notes/${node.id}`
      if (activeDay.value && !options.replace) await tabs.replace(path)
      else await navigateTo(path, { replace: options.replace })
      return true
    } catch (error) {
      showError(error, 'Could not open this day')
      return false
    }
  }

  // The day on its way, for keys pressed faster than days open: each counts from the last. It
  // stays until the page shows it (the route the layout sees changes once the page has loaded).
  const pending = useState<string | null>('daily:pending', () => null)
  watch(activeDay, (day) => {
    if (day && day === pending.value) pending.value = null
  })

  /** Days before or after the one shown (⌃⌥← ⌃⌥→, ⌥⌘← ⌥⌘→ and ‹ ›: one; with ↑ ↓: a week). */
  async function step(days: number) {
    const from = pending.value ?? activeDay.value
    if (!from) return
    const day = addDays(from, days)
    pending.value = day
    steps = steps.then(async () => {
      // A newer press asks for another day: this one is skipped.
      if (pending.value !== day) return
      const shown = nextPageShown()
      if (!(await open(day))) {
        if (pending.value === day) pending.value = null
        return
      }
      await shown
    })
    await steps
  }

  /** A day is shown, or one is on its way (⌥⌘← ⌥⌘→ then step days, not tabs). */
  const onDay = computed(() => !!pending.value || !!activeDay.value)

  return { open, step, activeDay, onDay }
}
