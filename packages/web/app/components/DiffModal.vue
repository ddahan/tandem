<script setup lang="ts">
// A line diff between two versions of a note.
import { diffLines } from 'diff'

const props = defineProps<{
  title: string
  before: string
  after: string
  beforeLabel: string
  afterLabel: string
}>()
const open = defineModel<boolean>('open', { default: false })

const lines = computed(() => {
  const result: { kind: 'added' | 'removed' | 'same'; text: string }[] = []
  for (const part of diffLines(props.before, props.after)) {
    const kind = part.added ? 'added' : part.removed ? 'removed' : 'same'
    for (const text of part.value.replace(/\n$/, '').split('\n')) result.push({ kind, text })
  }
  return result
})

const counts = computed(() => ({
  added: lines.value.filter((l) => l.kind === 'added').length,
  removed: lines.value.filter((l) => l.kind === 'removed').length,
}))
</script>

<template>
  <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-4xl' }">
    <template #description>
      <span class="flex gap-3 text-xs">
        <span class="text-error">− {{ counts.removed }} {{ beforeLabel }}</span>
        <span class="text-success">+ {{ counts.added }} {{ afterLabel }}</span>
      </span>
    </template>
    <template #body>
      <div v-if="!counts.added && !counts.removed" class="py-6 text-center text-sm text-muted">
        The two versions are identical.
      </div>
      <pre v-else class="max-h-[65vh] overflow-auto rounded-md text-xs leading-5"><code><span
        v-for="(line, index) in lines"
        :key="index"
        class="block px-3 whitespace-pre-wrap"
        :class="{
          'bg-success/10 text-success': line.kind === 'added',
          'bg-error/10 text-error line-through decoration-error/40': line.kind === 'removed',
          'text-muted': line.kind === 'same',
        }"
      >{{ line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  ' }}{{ line.text || ' ' }}</span></code></pre>
    </template>
  </UModal>
</template>
