<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const tree = useTree()
const { openSearch } = useSearchPalette()
const colorMode = useColorMode()

// At the bottom of the sidebar; the logo leads Home.
const navigation = computed<NavigationMenuItem[]>(() => [
  { label: 'Trash', icon: 'i-lucide-trash-2', to: '/trash' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
  { label: 'Shortcuts', icon: 'i-lucide-keyboard', to: '/shortcuts' },
])

const colorModes = [
  { value: 'light', icon: 'i-lucide-sun', label: 'Light' },
  { value: 'dark', icon: 'i-lucide-moon', label: 'Dark' },
  { value: 'system', icon: 'i-lucide-monitor', label: 'System' },
]

defineShortcuts({
  meta_alt_n: { usingInput: true, handler: () => void tree.createPage() },
  // From the editor too (usingInput): the editor doesn't use ⌘/.
  'meta_/': { usingInput: true, handler: () => void navigateTo('/shortcuts') },
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
  <UDashboardGroup unit="rem" storage="local" storage-key="myfluence-panels">
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
          <UFieldGroup v-if="!collapsed" size="xs">
            <UTooltip v-for="mode in colorModes" :key="mode.value" :text="mode.label">
              <UButton
                :icon="mode.icon"
                :aria-label="mode.label"
                color="neutral"
                :variant="colorMode.preference === mode.value ? 'soft' : 'ghost'"
                @click="colorMode.preference = mode.value"
              />
            </UTooltip>
          </UFieldGroup>
          <UDashboardSidebarCollapse />
        </div>
      </template>
    </UDashboardSidebar>

    <NoteSearch />

    <slot />
  </UDashboardGroup>
</template>
