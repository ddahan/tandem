<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const tree = useTree()
const { openSearch } = useSearchPalette()
const colorMode = useColorMode()

// At the bottom of the sidebar; the logo leads Home.
const navigation = computed<NavigationMenuItem[]>(() => [
  { label: 'Trash', icon: 'i-lucide-trash-2', to: '/trash' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
  { label: 'Shortcuts', icon: 'i-lucide-keyboard', to: '/shortcuts' },
])

// The landing page, over the app (LandingModal).
const aboutOpen = ref(false)

const colorModes = [
  { value: 'light', icon: 'i-lucide-sun', label: 'Light' },
  { value: 'dark', icon: 'i-lucide-moon', label: 'Dark' },
  { value: 'system', icon: 'i-lucide-monitor', label: 'System' },
]
// One button showing the current mode; its menu switches.
const currentMode = computed(
  () => colorModes.find((mode) => mode.value === colorMode.preference) ?? colorModes[2]!,
)
const colorModeItems = computed<DropdownMenuItem[]>(() =>
  colorModes.map((mode) => ({
    type: 'checkbox' as const,
    label: mode.label,
    icon: mode.icon,
    checked: colorMode.preference === mode.value,
    onUpdateChecked: () => (colorMode.preference = mode.value),
  })),
)

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
          <UDropdownMenu
            :items="colorModeItems"
            :content="{ side: 'top', align: 'start' }"
            :ui="{ content: 'min-w-36' }"
          >
            <UButton
              :icon="currentMode.icon"
              :label="collapsed ? undefined : currentMode.label"
              :trailing-icon="collapsed ? undefined : 'i-lucide-chevron-up'"
              :aria-label="`Theme: ${currentMode.label}`"
              color="neutral"
              variant="ghost"
              size="sm"
              :ui="{ trailingIcon: 'size-3.5 text-dimmed' }"
            />
          </UDropdownMenu>
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
