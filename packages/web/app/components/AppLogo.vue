<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()
</script>

<template>
  <NuxtLink to="/" class="flex items-center gap-2.5 px-1" aria-label="Myfluence home">
    <img src="/icon.svg" alt="" class="size-7 shrink-0 rounded-lg shadow-sm" />
    <span v-if="!collapsed" class="text-[15px] font-semibold tracking-tight text-highlighted"
      >myfluence</span
    >
  </NuxtLink>
</template>
