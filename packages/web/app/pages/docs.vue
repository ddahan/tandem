<script setup lang="ts">
// The Docs: how to install the app and connect agents, Tandem's concepts, a tour of the
// blocks, keeping the notes private, and the keyboard shortcuts. One tab per page (docs/*), so each has its address.
import type { NavigationMenuItem } from '@nuxt/ui'

const tabs: NavigationMenuItem[] = [
  { label: 'Install', icon: 'i-lucide-download', to: '/docs/install' },
  { label: 'Concepts', icon: 'i-lucide-lightbulb', to: '/docs/concepts' },
  { label: 'Blocks', icon: 'i-lucide-blocks', to: '/docs/blocks' },
  { label: 'Agents', icon: 'i-lucide-bot', to: '/docs/agents' },
  { label: 'Security', icon: 'i-lucide-shield-check', to: '/docs/security' },
  { label: 'Shortcuts', icon: 'i-lucide-keyboard', to: '/docs/shortcuts' },
]
</script>

<template>
  <UDashboardPanel id="docs">
    <template #header>
      <PageNavbar title="Docs" />
      <UDashboardToolbar>
        <UNavigationMenu :items="tabs" highlight class="-mx-1 flex-1" aria-label="Docs" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl py-4" data-keys-shown>
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
