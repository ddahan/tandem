<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { calendarDateOf } from '@tandem/shared'
import { noteIdOf } from '~/utils/tabs'

const tree = useTree()
const { settings } = useSettings()
const { openSearch } = useSearchPalette()
const todos = useTodos()
todos.follow()

// At the bottom of the sidebar; the logo leads Home. TODOs and Trash as Settings › Features say.
const navigation = computed<NavigationMenuItem[]>(() => [
  ...(settings.value.todos
    ? [
        {
          label: 'TODOs',
          icon: 'i-lucide-list-todo',
          to: '/todos',
          badge: todos.count.value ? String(todos.count.value) : undefined,
        },
      ]
    : []),
  ...(settings.value.trash ? [{ label: 'Trash', icon: 'i-lucide-trash-2', to: '/trash' }] : []),
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
  { label: 'Docs', icon: 'i-lucide-book-open', to: '/docs' },
])

// Daily notes, when on: above the tree, highlighted on a day's note.
const daily = useDaily()
const onDailyNote = computed(() => {
  if (route.name !== 'notes-id') return false
  const node = tree.byId.value.get(String(route.params.id))
  return !!node && !!calendarDateOf(node.path)
})
const calendarNavigation = computed<NavigationMenuItem[]>(() => [
  {
    label: 'Today',
    icon: 'i-lucide-calendar-days',
    active: onDailyNote.value,
    onSelect: () => void daily.open(),
  },
])

// Tabs (useTabs): the route is the active tab. Opening the app on Home brings back the tab that
// was active; a note that's gone (trash, deleted elsewhere) loses its tab.
const tabs = useTabs()
const route = useRoute()
watch(
  () => route.path,
  () => tabs.show(route),
  { immediate: true },
)
onMounted(() => {
  const last = tabs.tabs.value.find((tab) => tab.key === tabs.recent.value[0])
  if (route.path === '/' && last) void navigateTo(last.path, { replace: true })
})
watch(
  () => tree.byId.value,
  (byId) => {
    if (tree.loaded.value) void tabs.forgetNotes((id) => byId.has(id))
  },
)

// The open note's save status, next to the version.
const openNoteSave = useOpenNoteSave()

const createNextToOpen = () => tree.createPageNextTo(noteIdOf(tabs.activeKey.value ?? ''))

// The sidebar: collapsed or not from lg up, a drawer (open or not) below.
const sidebarCollapsed = ref(false)
const sidebarOpen = ref(false)
const wide = useMediaQuery('(min-width: 1024px)')
function toggleSidebar() {
  if (wide.value) sidebarCollapsed.value = !sidebarCollapsed.value
  else sidebarOpen.value = !sidebarOpen.value
}

// ⌘W closes the active tab. With none, it closes the app, as it would, but asks first (the
// browser's own "Leave?" question: a page can't close its window itself).
let askBeforeClosing: ((event: BeforeUnloadEvent) => void) | null = null
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const command = /Mac|iPhone|iPad/.test(navigator.userAgent) ? event.metaKey : event.ctrlKey
  if (!command || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'w') return
  // A tab just closed may still be the route for a moment: only a tab still open counts.
  if (tabs.tabs.value.some((tab) => tab.key === tabs.activeKey.value)) {
    event.preventDefault()
    void tabs.closeTab()
    return
  }
  if (askBeforeClosing) return
  askBeforeClosing = (unload) => unload.preventDefault()
  window.addEventListener('beforeunload', askBeforeClosing)
  // Only for this ⌘W: a later reload asks nothing.
  setTimeout(() => {
    if (askBeforeClosing) window.removeEventListener('beforeunload', askBeforeClosing)
    askBeforeClosing = null
  }, 1000)
})

/** This build's version (nuxt.config.ts), at the bottom of the sidebar; `dev` on the dev servers. */
const version = `${useRuntimeConfig().public.version}${import.meta.dev ? ' (dev)' : ''}`

// ⌘W, ⌘N, ⌘T and ⌘⇧T, as in VS Code: they reach Tandem in the installed app, where a browser
// reserves no keys (in a browser tab, they stay the browser's). ⌘T is today's note when daily
// notes are on (a new page otherwise, as ⌘N). ⌘1…9 do stay the browser's:
// tabs use ⌃1…9 (shortcuts.ts).
const tabShortcuts = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [
    `ctrl_${i + 1}`,
    { usingInput: true, handler: () => void tabs.at(i + 1) },
  ]),
)

defineShortcuts({
  ...tabShortcuts,
  // A new page next to the open one (same parent, right after it), or at the top level.
  meta_n: { usingInput: true, handler: () => void createNextToOpen() },
  meta_t: {
    usingInput: true,
    handler: () => void (settings.value.daily ? daily.open() : createNextToOpen()),
  },
  meta_shift_t: { usingInput: true, handler: () => void tabs.reopenClosed() },
  // ⌘B: Bold in a note or a field; elsewhere, and ⌥⌘B anywhere, the sidebar, as in VS Code.
  meta_b: () => toggleSidebar(),
  meta_alt_b: { usingInput: true, handler: () => toggleSidebar() },
  // On a day's note, the day after or before; elsewhere, the next or previous tab.
  meta_alt_arrowright: {
    usingInput: true,
    handler: () => void (daily.onDay.value ? daily.step(1) : tabs.step(1)),
  },
  meta_alt_arrowleft: {
    usingInput: true,
    handler: () => void (daily.onDay.value ? daily.step(-1) : tabs.step(-1)),
  },
  // The next or previous tab, always (⌥⌘← ⌥⌘→ step days on a day's note).
  meta_ctrl_arrowright: { usingInput: true, handler: () => void tabs.step(1) },
  meta_ctrl_arrowleft: { usingInput: true, handler: () => void tabs.step(-1) },
  // On a day's note, a week later or earlier.
  meta_alt_arrowdown: {
    usingInput: true,
    handler: () => void (daily.onDay.value && daily.step(7)),
  },
  meta_alt_arrowup: {
    usingInput: true,
    handler: () => void (daily.onDay.value && daily.step(-7)),
  },
  meta_alt_n: { usingInput: true, handler: () => void createNextToOpen() },
  // From the editor too (usingInput): the editor doesn't use ⌘/.
  'meta_/': { usingInput: true, handler: () => void navigateTo('/docs/shortcuts') },
  // Search in every note (as in VS Code); the selected text, if any, is the query.
  meta_shift_f: {
    usingInput: true,
    handler: () => {
      const selected = window.getSelection()?.toString().trim() ?? ''
      openSearch(selected.includes('\n') ? '' : selected)
    },
  },
})
</script>

<template>
  <UDashboardGroup unit="rem" storage="local" storage-key="tandem-panels">
    <UDashboardSidebar
      id="sidebar"
      v-model:collapsed="sidebarCollapsed"
      v-model:open="sidebarOpen"
      collapsible
      resizable
      :min-size="14"
      :default-size="17"
      :max-size="30"
      :ui="{ body: 'gap-3 pb-2', footer: 'border-t border-default py-2' }"
    >
      <template #header="{ collapsed }">
        <AppLogo :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          :collapsed="collapsed"
          :kbds="['meta', 'shift', 'f']"
          class="bg-transparent ring-default"
        />

        <UNavigationMenu
          v-if="settings.daily"
          :collapsed="collapsed"
          :items="calendarNavigation"
          orientation="vertical"
          tooltip
          aria-label="Calendar notes"
        />

        <NoteTree v-if="!collapsed" class="-mx-1 min-h-0 flex-1" />
        <div v-else class="flex justify-center">
          <UTooltip text="New page">
            <UButton
              icon="i-lucide-file-plus"
              color="neutral"
              variant="ghost"
              @click="tree.createPage()"
            />
          </UTooltip>
        </div>

        <div class="mt-auto flex flex-col gap-3">
          <InstallAppBanner v-if="!collapsed" />
          <UNavigationMenu
            :collapsed="collapsed"
            :items="navigation"
            orientation="vertical"
            tooltip
          />
        </div>
      </template>

      <template #footer="{ collapsed }">
        <div
          class="flex w-full items-center gap-1"
          :class="collapsed ? 'flex-col' : 'justify-between'"
        >
          <div class="flex min-w-0 items-center gap-3" :class="collapsed ? 'flex-col' : 'ps-2.5'">
            <span
              v-if="!collapsed"
              class="shrink-0 font-mono text-xs text-dimmed"
              data-testid="app-version"
              :title="`Tandem ${version}`"
              >v{{ version }}</span
            >
            <SaveStatus
              v-if="openNoteSave"
              :status="openNoteSave.status"
              :saved-at="openNoteSave.savedAt"
              :compact="collapsed"
            />
          </div>
          <UDashboardSidebarCollapse />
        </div>
      </template>
    </UDashboardSidebar>

    <NoteSearch />

    <slot />
  </UDashboardGroup>
</template>
