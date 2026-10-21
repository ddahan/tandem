<script setup lang="ts">
// The landing page's code themes card: a snippet in each of the app's code themes in turn (the
// colors Settings › Code blocks uses: main.css, data-code-preview), in the page's mode. A click
// on a theme's name shows it and stops the loop.
const THEMES = [
  { value: 'tandem', label: 'Tandem' },
  { value: 'github', label: 'GitHub' },
  { value: 'one', label: 'One' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'nord', label: 'Nord' },
  { value: 'solarized', label: 'Solarized' },
  { value: 'tomorrow', label: 'Tomorrow' },
] as const

const colorMode = useColorMode()
const current = ref(0)
const picked = ref(false)
useDemoLoop(async (wait) => {
  await wait(2200)
  if (!picked.value) current.value = (current.value + 1) % THEMES.length
})
const preview = computed(
  () => `${THEMES[current.value]!.value}-${colorMode.value === 'dark' ? 'dark' : 'light'}`,
)
function pick(index: number) {
  current.value = index
  picked.value = true
}
</script>

<template>
  <div>
    <pre
      :data-code-preview="preview"
      class="landing-code-themes overflow-hidden rounded-xl border p-4 font-mono text-[12.5px] leading-6"
      aria-hidden="true"
    ><span class="italic" style="color: var(--code-comment)">// Ship the beta</span>
<span style="color: var(--code-keyword)">export function</span> <span style="color: var(--code-title)">invite</span>(<span style="color: var(--code-params)">teams</span>: <span style="color: var(--code-type)">number</span>) {
  <span style="color: var(--code-keyword)">return</span> <span style="color: var(--code-string)">`Welcome, ${teams} teams`</span>
}</pre>
    <div class="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Code themes">
      <button
        v-for="(theme, index) in THEMES"
        :key="theme.value"
        type="button"
        class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
        :class="
          index === current
            ? 'border-primary bg-primary/10 text-highlighted'
            : 'border-default text-muted hover:text-highlighted'
        "
        :aria-pressed="index === current"
        @click="pick(index)"
      >
        {{ theme.label }}
      </button>
    </div>
  </div>
</template>

<style>
.landing-code-themes {
  background: var(--code-bg);
  border-color: var(--code-border);
  color: var(--code-fg);
  transition:
    background-color 0.5s,
    color 0.5s;
}
.landing-code-themes span {
  transition: color 0.5s;
}
</style>
