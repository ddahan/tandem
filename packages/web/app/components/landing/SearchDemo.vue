<script setup lang="ts">
// The landing page's search card: a query typed with a typo, corrected, results highlighted.
const QUERY = 'markting'
const RESULTS = [
  { emoji: '📊', title: 'Q4 plan', before: 'Hiring and ', match: 'marketing', after: ' budget' },
  {
    emoji: '🚀',
    title: 'Launch plan',
    before: 'Coordinate with ',
    match: 'marketing',
    after: ' on the post',
  },
  { emoji: '🗒️', title: 'Meeting notes', before: '', match: 'Marketing', after: ' sync, Tuesday' },
]

const query = ref('')
const shown = ref(0)

const { reduced } = useDemoLoop(async (wait) => {
  query.value = ''
  shown.value = 0
  await wait(900)
  for (const char of QUERY) {
    query.value += char
    await wait(70 + Math.random() * 60)
  }
  await wait(300)
  for (let count = 1; count <= RESULTS.length; count++) {
    shown.value = count
    await wait(140)
  }
  await wait(3600)
})

watch(
  reduced,
  (value) => {
    if (!value) return
    query.value = QUERY
    shown.value = RESULTS.length
  },
  { immediate: true },
)
</script>

<template>
  <div class="rounded-xl border border-default bg-default text-sm shadow-lg" aria-hidden="true">
    <div class="flex items-center gap-2 border-b border-default px-3 py-2.5">
      <UIcon name="i-lucide-search" class="size-4 text-dimmed" />
      <span class="text-highlighted">{{ query }}</span>
      <span class="-ms-1.5 h-4 w-px animate-pulse bg-primary" />
      <span class="ms-auto flex gap-0.5"
        ><UKbd value="meta" /><UKbd value="shift" /><UKbd value="F"
      /></span>
    </div>
    <div class="min-h-44 p-1.5">
      <p
        class="px-2 py-1 text-xs text-muted transition-opacity duration-300"
        :class="shown ? 'opacity-100' : 'opacity-0'"
      >
        Showing results for <span class="font-medium text-highlighted">“marketing”</span>
      </p>
      <div
        v-for="(result, index) in RESULTS"
        :key="result.title"
        class="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-all duration-300"
        :class="[
          index < shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
          index === 0 && 'bg-elevated',
        ]"
      >
        <span class="text-base leading-5">{{ result.emoji }}</span>
        <div class="min-w-0">
          <p class="font-medium text-highlighted">{{ result.title }}</p>
          <p class="truncate text-xs text-muted">
            {{ result.before
            }}<mark class="rounded-sm bg-primary/15 px-0.5 text-primary">{{ result.match }}</mark
            >{{ result.after }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
