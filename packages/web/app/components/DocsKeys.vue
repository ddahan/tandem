<script setup lang="ts">
// What to type or press for a shortcut (Docs › Shortcuts and Blocks): typed Markdown in code,
// then key combinations separated by "or".
defineProps<{ typed?: string; keys?: string[][] }>()
</script>

<template>
  <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
    <code
      v-if="typed"
      class="rounded-md border border-muted bg-muted px-1.5 py-0.5 font-mono text-xs whitespace-pre text-highlighted"
      >{{ typed }}</code
    >
    <template v-for="(combo, index) in keys ?? []" :key="combo.join('+')">
      <span v-if="index > 0 || typed" class="text-xs text-dimmed">or</span>
      <span class="flex items-center gap-0.5">
        <UKbd v-for="key in combo" :key="key" :value="key" />
      </span>
    </template>
  </div>
</template>
