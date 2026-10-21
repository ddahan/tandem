<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const tree = useTree()
const { openSearch } = useSearchPalette()
const todos = useTodos()
todos.follow()

// At the bottom of the sidebar; the logo leads Home.
const navigation = computed<NavigationMenuItem[]>(() => [
  {
    label: 'TODOs',
    icon: 'i-lucide-list-todo',
    to: '/todos',
    badge: todos.count.value ? String(todos.count.value) : undefined,
  },
  { label: 'Trash', icon: 'i-lucide-trash-2', to: '/trash' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
  { label: 'Docs', icon: 'i-lucide-book-open', to: '/docs' },
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

/** This build's version (nuxt.config.ts), at the bottom of the sidebar; `dev` on the dev servers. */
const version = `${useRuntimeConfig().public.version}${import.meta.dev ? ' (dev)' : ''}`

// ⌘W, ⌘T and ⌘1…9 belong to the browser: tabs use ⌥⌘W, ⌥⌘T and ⌃1…9 (shortcuts.ts).
const tabShortcuts = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [
    `ctrl_${i + 1}`,
    { usingInput: true, handler: () => void tabs.at(i + 1) },
  ]),
)

defineShortcuts({
  ...tabShortcuts,
  meta_alt_w: { usingInput: true, handler: () => void tabs.closeTab() },
  meta_alt_t: { usingInput: true, handler: () => void tabs.reopenClosed() },
  meta_alt_arrowright: { usingInput: true, handler: () => void tabs.step(1) },
  meta_alt_arrowleft: { usingInput: true, handler: () => void tabs.step(-1) },
  meta_alt_n: { usingInput: true, handler: () => void tree.createPage() },
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
