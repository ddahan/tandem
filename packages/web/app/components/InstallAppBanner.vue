<script setup lang="ts">
// The sidebar's offer to install Myfluence as an app, while it runs in a browser tab that can
// install it (useInstallApp). Closing it hides it for good; Settings still offers to install.
import { accentShade, logoSvg } from '~/utils/logo'

const { method, dismissed, install } = useInstallApp()
const logo = logoSvg(accentShade, 'install-banner-logo')
</script>

<template>
  <div
    v-if="method && !dismissed"
    class="relative rounded-lg border border-default bg-elevated/40 p-3"
    data-testid="install-banner"
  >
    <UButton
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="xs"
      class="absolute top-1.5 right-1.5"
      aria-label="Don't offer again"
      @click="dismissed = true"
    />
    <div class="flex items-center gap-3 pe-5">
      <!-- eslint-disable-next-line vue/no-v-html -- our own static drawing -->
      <span
        class="size-9 shrink-0 overflow-hidden rounded-[22%] shadow-sm [&_svg]:size-full"
        v-html="logo"
      />
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">Install Myfluence</p>
        <p class="text-xs text-muted">
          {{ method === 'ios' ? 'On your Home Screen.' : 'In your Dock, in its own window.' }}
        </p>
      </div>
    </div>
    <UButton
      v-if="method === 'prompt'"
      label="Install"
      icon="i-lucide-download"
      size="sm"
      block
      class="mt-3"
      @click="install"
    />
    <UPopover v-else :content="{ side: 'right', align: 'end' }">
      <UButton label="How to install" icon="i-lucide-download" size="sm" block class="mt-3" />
      <template #content>
        <div class="w-64 p-4">
          <p class="mb-3 text-sm font-semibold text-highlighted">Install from Safari</p>
          <InstallSteps :platform="method" />
        </div>
      </template>
    </UPopover>
  </div>
</template>
