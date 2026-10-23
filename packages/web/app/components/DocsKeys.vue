<script setup lang="ts">
// What to type or press for a shortcut (Docs › Shortcuts and Blocks): typed Markdown in code,
// then key combinations separated by "or". The key `arrows` stands for any arrow key (one chip,
// a four-way arrow), for a shortcut each arrow is part of.
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
        <template v-for="key in combo" :key="key">
          <UKbd v-if="key === 'arrows'" title="Any arrow key" aria-label="Any arrow key">
            <UIcon name="i-lucide-move" class="size-3" />
          </UKbd>
          <UKbd v-else :value="key" />
        </template>
      </span>
    </template>
  </div>
</template>
