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

/** This build's version (nuxt.config.ts), at the bottom of the sidebar; `dev` on the dev servers. */
const version = `${useRuntimeConfig().public.version}${import.meta.dev ? ' (dev)' : ''}`

// The landing page, over the app (LandingModal).
const aboutOpen = ref(false)

defineShortcuts({
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
          <span
            v-if="!collapsed"
            class="ps-2.5 font-mono text-xs text-dimmed"
            data-testid="app-version"
            :title="`Tandem ${version}`"
            >v{{ version }}</span
          >
          <div class="flex items-center gap-1" :class="collapsed && 'flex-col'">
            <UTooltip text="About Tandem">
              <UButton
                icon="i-lucide-info"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="About Tandem"
                @click="aboutOpen = true"
              />
            </UTooltip>
            <UDashboardSidebarCollapse />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <NoteSearch />
    <LazyLandingModal v-if="aboutOpen" v-model:open="aboutOpen" />

    <slot />
  </UDashboardGroup>
</template>
