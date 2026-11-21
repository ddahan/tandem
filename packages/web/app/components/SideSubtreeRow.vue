<script setup lang="ts">
// A row of SideSubtree: an item of a page under the one shown (or of it), its icon, name and
// detail on one line (every row of the Items tab has the same height); with `showPage`, the
// page it is in (the flat display). A click opens it (the page, the file, the website; a
// bookmark: edited in a popover next to the row), a double click a bookmark's website.
import type { SubtreeItem } from '~/utils/subtree-items'

defineProps<{ item: SubtreeItem; showPage?: boolean }>()
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-start transition-colors duration-[120ms] hover:bg-accented"
    :class="item.missing && 'text-dimmed'"
    :data-testid="`side-item-${item.label}`"
    @click="item.open($event.currentTarget as HTMLElement)"
    @keydown.enter="item.open($event.currentTarget as HTMLElement)"
    @dblclick="item.activate?.()"
  >
    <!-- eslint-disable-next-line vue/no-v-html -- bundled icon SVG (file-icons.generated.ts) -->
    <span v-if="item.fileSvg" class="size-4 shrink-0 [&_svg]:size-full" v-html="item.fileSvg" />
    <BookmarkIcon v-else-if="item.bookmark !== undefined" :bookmark="item.bookmark" size="md" />
    <UIcon v-else :name="item.icon ?? 'i-lucide-file'" class="size-4 shrink-0 text-dimmed" />
    <span
      class="min-w-0 flex-1 truncate text-sm"
      :class="item.missing ? 'text-dimmed' : 'text-default'"
    >
      {{ item.label }}
    </span>
    <span
      v-if="item.detail || showPage"
      class="max-w-2/5 shrink-0 truncate text-xs text-dimmed"
      data-testid="side-item-detail"
    >
      {{ [item.detail, showPage ? item.page.title : ''].filter(Boolean).join(' · ') }}
    </span>
  </div>
</template>
