<script setup lang="ts">
// Docs › Shortcuts: every keyboard shortcut and typing rule (from utils/shortcuts.ts).
import { SHORTCUT_GROUPS } from '~/utils/shortcuts'

useHead({ title: 'Keyboard shortcuts' })
</script>

<template>
  <div class="space-y-10">
    <p class="text-sm text-muted">
      <UKbd value="meta" /> is ⌘ on a Mac and Ctrl elsewhere, <UKbd value="alt" /> is ⌥ (Option) or
      Alt. Open this page from anywhere with <UKbd value="meta" /> <UKbd value="/" />.
    </p>

    <section
      v-for="group in SHORTCUT_GROUPS"
      :key="group.id"
      :aria-labelledby="`shortcuts-${group.id}`"
    >
      <div class="mb-3 flex items-start gap-3">
        <UIcon :name="group.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h2 :id="`shortcuts-${group.id}`" class="font-semibold text-highlighted">
            {{ group.title }}
          </h2>
          <p class="text-sm text-muted">{{ group.description }}</p>
        </div>
      </div>

      <div class="divide-y divide-default rounded-lg border border-default">
        <div
          v-for="shortcut in group.shortcuts"
          :key="shortcut.label + (shortcut.typed ?? '')"
          class="flex items-center justify-between gap-4 px-4 py-2.5"
          data-testid="shortcut"
        >
          <div class="min-w-0">
            <p class="text-sm text-default">{{ shortcut.label }}</p>
            <p v-if="shortcut.description" class="text-xs text-dimmed">
              {{ shortcut.description }}
            </p>
          </div>
          <DocsKeys :typed="shortcut.typed" :keys="shortcut.keys" />
        </div>
      </div>
    </section>
  </div>
</template>
