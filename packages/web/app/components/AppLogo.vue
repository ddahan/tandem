<script setup lang="ts">
// The logo, in the accent color, and the workspace name (Settings).
import { accentShade, logoSvg } from '~/utils/logo'

defineProps<{ collapsed?: boolean }>()
const svg = logoSvg(accentShade, 'sidebar-logo')
const { settings } = useSettings()
</script>

<template>
  <NuxtLink
    to="/"
    class="flex min-w-0 items-center gap-2.5 px-1"
    :aria-label="`${settings.workspaceName} home`"
  >
    <!-- eslint-disable-next-line vue/no-v-html -- our own static drawing -->
    <span
      class="size-7 shrink-0 overflow-hidden rounded-lg shadow-sm [&_svg]:size-full"
      data-testid="app-logo"
      v-html="svg"
    />
    <span
      v-if="!collapsed"
      class="truncate text-[15px] font-semibold tracking-tight text-highlighted"
      data-testid="workspace-name"
      >{{ settings.workspaceName }}</span
    >
  </NuxtLink>
</template>
