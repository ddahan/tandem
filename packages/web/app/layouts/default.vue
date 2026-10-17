<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const tree = useTree()
const colorMode = useColorMode()

const navigation = computed<NavigationMenuItem[]>(() => [
  { label: 'Home', icon: 'i-lucide-house', to: '/' },
  { label: 'Search', icon: 'i-lucide-search', to: '/search' },
  { label: 'Trash', icon: 'i-lucide-trash-2', to: '/trash' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
])

const colorModes = [
  { value: 'light', icon: 'i-lucide-sun', label: 'Light' },
  { value: 'dark', icon: 'i-lucide-moon', label: 'Dark' },
  { value: 'system', icon: 'i-lucide-monitor', label: 'System' },
]

defineShortcuts({
  meta_alt_n: () => void tree.createPage(),
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
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="navigation"
          orientation="vertical"
          tooltip
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
