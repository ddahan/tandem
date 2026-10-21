<script setup lang="ts">
// The landing page's tabs card: notes open side by side in tabs, the current one moving from tab
// to tab, each with its page's lines.
const TABS = [
  { title: 'Launch', icon: '🚀', lines: ['88%', '64%', '76%'] },
  { title: 'Roadmap', icon: '🗺️', lines: ['70%', '82%', '52%'] },
  { title: 'Ideas', icon: '💡', lines: ['80%', '58%', '72%'] },
]

const current = ref(0)
useDemoLoop(async (wait) => {
  await wait(2400)
  current.value = (current.value + 1) % TABS.length
})
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-default bg-default" aria-hidden="true">
    <div class="flex gap-1 border-b border-default bg-elevated/60 px-2 pt-2">
      <span
        v-for="(tab, index) in TABS"
        :key="tab.title"
        class="flex min-w-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-2.5 py-1.5 text-xs transition-colors duration-300"
        :class="
          index === current
            ? 'border-default bg-default text-highlighted'
            : 'border-transparent text-muted'
        "
      >
        <span>{{ tab.icon }}</span>
        <span class="truncate">{{ tab.title }}</span>
      </span>
    </div>
    <div class="space-y-2.5 p-4">
      <p class="text-sm font-semibold text-highlighted">{{ TABS[current]!.title }}</p>
      <span
        v-for="(width, index) in TABS[current]!.lines"
        :key="`${current}-${index}`"
        class="landing-tab-line block h-2 rounded-full bg-accented"
        :style="{ width, '--line-delay': `${index * 80}ms` }"
      />
    </div>
  </div>
</template>

<style>
.landing-tab-line {
  animation: landing-tab-line 0.4s ease-out both;
  animation-delay: var(--line-delay);
}
@keyframes landing-tab-line {
  from {
    opacity: 0;
    transform: scaleX(0.6);
    transform-origin: left;
  }
}
</style>
