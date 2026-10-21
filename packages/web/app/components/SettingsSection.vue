<script setup lang="ts">
// A section of a Settings tab: its title, what it does, then its controls. Sections are
// separated by a line (USeparator, in the tab). `for` names the control the title labels (a
// switch, on the right of the title).
defineProps<{ title: string; description?: string; for?: string }>()
</script>

<template>
  <section>
    <div class="flex items-start justify-between gap-4" :class="$slots.default && 'mb-4'">
      <div class="min-w-0">
        <component
          :is="$props.for ? 'label' : 'h2'"
          :for="$props.for"
          class="block font-semibold text-highlighted"
          >{{ title }}</component
        >
        <p v-if="description" class="text-sm text-muted">{{ description }}</p>
      </div>
      <slot name="action" />
    </div>
    <slot />
  </section>
</template>
