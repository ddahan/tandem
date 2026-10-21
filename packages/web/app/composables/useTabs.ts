// Open pages as tabs, as VS Code opens files in editors. A note, and the app's own pages (Docs,
// Settings, TODOs, Trash), each have one tab; the route is the active tab. A single click in
// the tree opens a note in the preview tab (one at most, in italics, replaced by the next
// preview, and closed once another page shows); a double click, editing the note, or any other
// way of opening it gives it a tab of its own. Days of daily notes follow each other in one tab
// (`replace`). Closing the active tab shows the one used before it, or Home with none left. The
// tabs, their order and the recently used ones are kept in localStorage.
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { noteIdOf, tabKeyOf } from '~/utils/tabs'

export interface Tab {
  key: string
  /** Where it leads (a Docs tab remembers its section). */
  path: string
  /** The preview tab: replaced by the next preview, until kept open. */
  preview: boolean
}

interface Saved {
  tabs: Tab[]
  recent: string[]
}

const STORAGE_KEY = 'tandem-tabs'
/** How many closed tabs can be reopened. */
const CLOSED_LIMIT = 20

/** Forgets every tab (switching notes folders: another folder's notes are other notes). */
export function forgetTabs() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing kept, then.
  }
}

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Saved | null
    if (saved && Array.isArray(saved.tabs) && Array.isArray(saved.recent)) return saved
  } catch {
    // Not saved, or not readable: no tabs.
  }
  return { tabs: [], recent: [] }
}

export function useTabs() {
  const saved = useState('tabs:saved', load)
  const tabs = computed(() => saved.value.tabs)
  /** Keys, most recently active first. */
  const recent = computed(() => saved.value.recent)
  const closed = useState<Tab[]>('tabs:closed', () => [])
  /** The path to open in the preview tab when the router shows it (set by `preview`). */
  const pendingPreview = useState<string | null>('tabs:pending-preview', () => null)
  /** The path to show in the active tab, in place of its page, when the router shows it. */
  const pendingReplace = useState<{ path: string; key: string } | null>(
    'tabs:pending-replace',
    () => null,
  )
  const route = useRoute()
  const activeKey = computed(() => tabKeyOf(route.path))

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.value))
    } catch {
      // Private browsing, quota: the tabs just won't come back.
    }
  }

  function touch(key: string) {
    saved.value.recent = [key, ...saved.value.recent.filter((k) => k !== key)]
  }

  /** Shows the route in its tab, opening one if needed (the router calls it: see default.vue).
   * The preview tab closes once something else shows: it only lasts while it's looked at. */
  function show(current: RouteLocationNormalizedLoaded) {
    const key = tabKeyOf(current.path)
    const asPreview = pendingPreview.value === current.path
    pendingPreview.value = null
    const replacing = pendingReplace.value?.path === current.path ? pendingReplace.value : null
    pendingReplace.value = null
    const list = saved.value.tabs
    // In place of the tab's page (another day): the same tab, unless the page has one already.
    const replaced = replacing && key && list.find((tab) => tab.key === replacing.key)
    if (replaced && !list.some((tab) => tab.key === key)) {
      saved.value.recent = saved.value.recent.filter((k) => k !== replaced.key)
      replaced.key = key
      replaced.path = current.path
      touch(key)
      persist()
      return
    }
    // Where a new tab goes: right of the tab that was active, as in VS Code, or in the place of
    // the preview tab it replaces.
    const previewIndex = list.findIndex((t) => t.preview)
    const activeIndex = list.findIndex((t) => t.key === saved.value.recent[0])
    let insertAt = activeIndex >= 0 ? activeIndex + 1 : list.length
    if (previewIndex >= 0 && list[previewIndex]!.key !== key) {
      const left = list[previewIndex]!
      list.splice(previewIndex, 1)
      saved.value.recent = saved.value.recent.filter((k) => k !== left.key)
      if (asPreview || previewIndex === activeIndex) insertAt = previewIndex
      else if (previewIndex < insertAt) insertAt--
    }
    if (key) {
      const existing = list.find((tab) => tab.key === key)
      if (existing) existing.path = current.path
      else list.splice(insertAt, 0, { key, path: current.path, preview: asPreview })
      touch(key)
    }
    persist()
  }

  /** Opens a path in the preview tab (a single click in the tree), unless it has a tab. */
  function preview(path: string) {
    if (tabKeyOf(path) === activeKey.value) return
    pendingPreview.value = path
    return navigateTo(path)
  }

  /** Opens a path in a tab of its own (a double click in the tree): keeps a preview open. */
  function open(path: string) {
    const key = tabKeyOf(path)
    // A preview of it still on its way: it arrives kept open.
    if (pendingPreview.value === path) pendingPreview.value = null
    if (key === activeKey.value) keepOpen(key)
    else return navigateTo(path)
  }

  /** Shows a path in the active tab, in place of its page (from one day to another). */
  function replace(path: string) {
    const key = activeKey.value
    if (key) pendingReplace.value = { path, key }
    return navigateTo(path)
  }

  /** Makes a tab a tab of its own, no longer replaced by the next preview. */
  function keepOpen(key = activeKey.value) {
    const tab = saved.value.tabs.find((t) => t.key === key)
    if (!tab?.preview) return
    tab.preview = false
    persist()
  }

  function activate(key: string) {
    const tab = saved.value.tabs.find((t) => t.key === key)
    if (tab) return navigateTo(tab.path)
  }

  /** Closes tabs; when the active one goes, shows the one used most recently, or Home. */
  function close(keys: string[]) {
    if (!keys.length) return
    const gone = saved.value.tabs.filter((tab) => keys.includes(tab.key))
    closed.value = [...gone.toReversed(), ...closed.value].slice(0, CLOSED_LIMIT)
    saved.value.tabs = saved.value.tabs.filter((tab) => !keys.includes(tab.key))
    saved.value.recent = saved.value.recent.filter((key) => !keys.includes(key))
    persist()
    if (activeKey.value && keys.includes(activeKey.value)) {
      const next = saved.value.tabs.find((tab) => tab.key === saved.value.recent[0])
      return navigateTo(next?.path ?? '/')
    }
  }

  const closeTab = (key = activeKey.value) => (key ? close([key]) : undefined)
  const closeOthers = (key: string) =>
    close(saved.value.tabs.filter((t) => t.key !== key).map((t) => t.key))
  function closeToTheRight(key: string) {
    const index = saved.value.tabs.findIndex((t) => t.key === key)
    return close(saved.value.tabs.slice(index + 1).map((t) => t.key))
  }
  const closeAll = () => close(saved.value.tabs.map((t) => t.key))

  /** Reopens the tab closed last (it becomes the active one). */
  function reopenClosed() {
    const [tab, ...rest] = closed.value
    if (!tab) return
    closed.value = rest
    return navigateTo(tab.path)
  }

  /** The next or previous tab, in their order (wrapping around). */
  function step(by: 1 | -1) {
    const list = saved.value.tabs
    if (!list.length) return
    const index = list.findIndex((t) => t.key === activeKey.value)
    const next = list[(index + by + list.length) % list.length]!
    return navigateTo(next.path)
  }

  /** The tab at a position (1-based, as ⌃1…⌃9), the last one for 9, as in VS Code. */
  function at(position: number) {
    const list = saved.value.tabs
    const tab = position === 9 ? list.at(-1) : list[position - 1]
    if (tab) return navigateTo(tab.path)
  }

  /** Moves a tab before another one, or to the end (dragging it). */
  function moveBefore(key: string, beforeKey: string | null) {
    if (key === beforeKey) return
    const list = saved.value.tabs
    const from = list.findIndex((t) => t.key === key)
    if (from < 0) return
    const [tab] = list.splice(from, 1)
    const to = beforeKey ? list.findIndex((t) => t.key === beforeKey) : -1
    list.splice(to >= 0 ? to : list.length, 0, tab!)
    persist()
  }

  /** Closes the tabs of notes that are gone (trashed, deleted), without opening anything. */
  function forgetNotes(exists: (id: string) => boolean) {
    const gone = saved.value.tabs
      .filter((tab) => {
        const id = noteIdOf(tab.key)
        return id !== null && !exists(id)
      })
      .map((tab) => tab.key)
    if (gone.length) return close(gone)
  }

  return {
    tabs,
    recent,
    activeKey,
    show,
    replace,
    preview,
    open,
    keepOpen,
    activate,
    closeTab,
    closeOthers,
    closeToTheRight,
    closeAll,
    reopenClosed,
    step,
    at,
    moveBefore,
    forgetNotes,
  }
}
