// What a tab shows of its page (TabBar, TabChip): its title, icon, and the path in its tooltip.
import { calendarDateOf, dayLabel } from '@tandem/shared'
import type { Tab } from '~/composables/useTabs'
import { bookmarkIdOf, noteIdOf } from '~/utils/tabs'

/** The app's own pages, with their sidebar titles and icons. */
const PAGES: Record<string, { title: string; icon: string }> = {
  docs: { title: 'Docs', icon: 'i-lucide-book-open' },
  settings: { title: 'Settings', icon: 'i-lucide-settings' },
  todos: { title: 'TODOs', icon: 'i-lucide-list-todo' },
  trash: { title: 'Trash', icon: 'i-lucide-trash-2' },
}

export function useTabInfo() {
  const tree = useTree()
  const bookmarks = useBookmarks()
  const { settings } = useSettings()

  function nodeOf(tab: Tab) {
    const id = noteIdOf(tab.key)
    return id ? tree.byId.value.get(id) : undefined
  }
  function bookmarkOf(tab: Tab) {
    const id = bookmarkIdOf(tab.key)
    return id ? bookmarks.byId.value.get(id) : undefined
  }
  /** A daily note's day (daily notes on): its tab reads "Today", "Wed 14 Oct"… */
  function dayOf(tab: Tab) {
    const node = nodeOf(tab)
    return node && settings.value.daily ? calendarDateOf(node.path) : null
  }
  function titleOf(tab: Tab) {
    const day = dayOf(tab)
    if (day) return dayLabel(day).short
    if (noteIdOf(tab.key)) return nodeOf(tab)?.title ?? '…'
    if (bookmarkIdOf(tab.key)) return bookmarkOf(tab)?.title ?? '…'
    return PAGES[tab.key]?.title ?? tab.key
  }
  function iconOf(tab: Tab) {
    if (dayOf(tab)) return 'i-lucide-calendar-days'
    return PAGES[tab.key]?.icon ?? (noteIdOf(tab.key) ? 'i-lucide-file-text' : 'i-lucide-file')
  }
  /** A day's tooltip is its whole date (it is in no page). */
  function tooltipOf(tab: Tab) {
    const day = dayOf(tab)
    return day ? dayLabel(day).title : titleOf(tab)
  }
  /** A note's pages, from the top: the tooltip's path. */
  function pathOf(tab: Tab) {
    if (dayOf(tab)) return []
    const id = noteIdOf(tab.key)
    return id ? tree.ancestors(id) : []
  }

  return { nodeOf, bookmarkOf, dayOf, titleOf, iconOf, tooltipOf, pathOf }
}
