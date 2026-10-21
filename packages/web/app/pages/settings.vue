<script setup lang="ts">
// Settings, in tabs (as the Docs): General, Appearance, Editor, Features. One page per tab
// (settings/*), so each has its address.
import type { NavigationMenuItem } from '@nuxt/ui'

const tabs: NavigationMenuItem[] = [
  { label: 'General', icon: 'i-lucide-sliders-horizontal', to: '/settings/general' },
  { label: 'Appearance', icon: 'i-lucide-palette', to: '/settings/appearance' },
  { label: 'Editor', icon: 'i-lucide-type', to: '/settings/editor' },
  { label: 'Features', icon: 'i-lucide-toggle-right', to: '/settings/features' },
]
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <PageNavbar title="Settings" />
      <UDashboardToolbar>
        <UNavigationMenu :items="tabs" highlight class="-mx-1 flex-1" aria-label="Settings" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl py-4">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
