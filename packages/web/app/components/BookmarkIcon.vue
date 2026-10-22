<script setup lang="ts">
// A bookmark's icon: its site's favicon, a globe without one (or when it doesn't load), or a
// folder.
import type { Bookmark } from '@tandem/shared'

const props = withDefaults(
  defineProps<{ bookmark: Pick<Bookmark, 'kind' | 'icon'> | null; size?: 'sm' | 'md' | 'lg' }>(),
  { size: 'sm' },
)

const SIZES = { sm: 'size-4', md: 'size-5', lg: 'size-8' }
const broken = ref(false)
watch(
  () => props.bookmark?.icon,
  () => (broken.value = false),
)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center select-none"
    :class="SIZES[size]"
    data-testid="bookmark-icon"
  >
    <UIcon
      v-if="bookmark?.kind === 'folder'"
      name="i-lucide-folder"
      class="size-full text-dimmed"
    />
    <img
      v-else-if="bookmark?.icon && !broken"
      :src="bookmark.icon"
      alt=""
      class="size-full rounded-[20%] object-contain"
      draggable="false"
      @error="broken = true"
    />
    <UIcon v-else name="i-lucide-globe" class="size-full text-dimmed" />
  </span>
</template>
