<script setup lang="ts">
// The lines the editor would lose, in a sentence: "line 17 (an HTML comment), line 20 (HTML
// <kbd>)". Each line number is a link to it in the Markdown view.
import type { Loss } from '~/utils/markdown-loss'

const props = defineProps<{ losses: Loss[] }>()
defineEmits<{ go: [line: number] }>()

const shown = computed(() => props.losses.slice(0, 3))
</script>

<template>
  <span>
    <template v-for="(loss, index) in shown" :key="loss.line">
      {{ index ? ', ' : ''
      }}<button
        type="button"
        class="font-medium underline underline-offset-2 hover:no-underline"
        @click="$emit('go', loss.line)"
      >
        line {{ loss.line }}</button
      >&nbsp;({{ loss.what }})</template
    ><template v-if="losses.length > 3">, and {{ losses.length - 3 }} more</template>
  </span>
</template>
