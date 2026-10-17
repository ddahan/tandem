<script setup lang="ts">
// The icon of a page or folder: its custom emoji or image, or the default Lucide icon.
import type { NodeIcon, NodeKind } from '@myfluence/shared'

const props = withDefaults(
  defineProps<{ icon: NodeIcon | null; kind: NodeKind; size?: 'sm' | 'md' | 'title' }>(),
  {
    size: 'sm',
  },
)

const SIZES = {
  sm: { box: 'size-4', emoji: 'text-[0.95rem]', icon: 'size-4' },
  md: { box: 'size-5', emoji: 'text-lg', icon: 'size-4.5' },
  // Next to a title: follows its font size.
  title: { box: 'size-[1.15em]', emoji: 'text-[0.95em]', icon: 'size-[0.9em]' },
}
const sizes = computed(() => SIZES[props.size])
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center leading-none select-none"
    :class="sizes.box"
    data-testid="node-icon"
  >
    <span v-if="icon?.type === 'emoji'" :class="sizes.emoji" role="img" :aria-label="icon.emoji">{{
      icon.emoji
    }}</span>
    <img
      v-else-if="icon?.type === 'image'"
      :src="icon.url"
      alt=""
      class="size-full rounded-[20%] object-cover"
      draggable="false"
    />
    <UIcon
      v-else
      :name="kind === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text'"
      class="text-dimmed"
      :class="sizes.icon"
    />
  </span>
</template>
