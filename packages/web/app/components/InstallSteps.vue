<script setup lang="ts">
// How to install from Safari, which has no install button for pages to show (useInstallApp).
const props = defineProps<{ platform: 'safari' | 'ios' }>()

const steps = computed(() =>
  props.platform === 'safari'
    ? [
        { text: "In Safari's menu bar, open", strong: 'File' },
        { text: 'Choose', strong: 'Add to Dock…' },
      ]
    : [
        { text: 'Tap', strong: 'Share', icon: 'i-lucide-share' },
        { text: 'Choose', strong: 'Add to Home Screen' },
      ],
)
</script>

<template>
  <ol class="space-y-2 text-sm text-default" data-testid="install-steps">
    <li v-for="(step, index) in steps" :key="index" class="flex items-center gap-2">
      <span
        class="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
        >{{ index + 1 }}</span
      >
      <span>
        {{ step.text }}
        <UIcon v-if="step.icon" :name="step.icon" class="size-4 align-[-3px] text-primary" />
        <span class="font-medium text-highlighted">{{ step.strong }}</span>
      </span>
    </li>
  </ol>
</template>
