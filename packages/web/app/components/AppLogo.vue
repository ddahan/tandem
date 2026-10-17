<script setup lang="ts">
// The logo, in the accent color (Settings).
import { accentShade, logoSvg } from '~/utils/logo'

defineProps<{ collapsed?: boolean }>()
const svg = logoSvg(accentShade, 'sidebar-logo')
</script>

<template>
  <NuxtLink to="/" class="flex items-center gap-2.5 px-1" aria-label="Myfluence home">
    <!-- eslint-disable-next-line vue/no-v-html -- our own static drawing -->
    <span
      class="size-7 shrink-0 overflow-hidden rounded-lg shadow-sm [&_svg]:size-full"
      data-testid="app-logo"
      v-html="svg"
    />
    <span v-if="!collapsed" class="text-[15px] font-semibold tracking-tight text-highlighted"
      >myfluence</span
    >
  </NuxtLink>
</template>
