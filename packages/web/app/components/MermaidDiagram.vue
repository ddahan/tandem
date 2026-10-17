<script setup lang="ts">
// Renders a Mermaid diagram (loaded on first use: Mermaid is large).
import { useDebounceFn } from '@vueuse/core'

const props = defineProps<{ code: string }>()
const colorMode = useColorMode()
const svg = ref('')
const error = ref<string | null>(null)
let counter = 0

const render = useDebounceFn(async () => {
  if (!props.code.trim()) {
    svg.value = ''
    return
  }
  try {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: colorMode.value === 'dark' ? 'dark' : 'neutral',
      fontFamily: 'inherit',
    })
    const result = await mermaid.render(`mermaid-${Date.now()}-${counter++}`, props.code)
    svg.value = result.svg
    error.value = null
  } catch (e) {
    error.value =
      e instanceof Error ? (e.message.split('\n')[0] ?? 'Invalid diagram') : 'Invalid diagram'
  }
}, 300)

watch(() => [props.code, colorMode.value], render, { immediate: true })
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-muted bg-default p-4">
    <p v-if="error" class="text-xs text-error">{{ error }}</p>
    <!-- eslint-disable-next-line vue/no-v-html -- Mermaid's output, rendered with securityLevel 'strict' -->
    <div v-else class="flex justify-center [&_svg]:max-w-full" v-html="svg" />
  </div>
</template>
