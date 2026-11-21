<script setup lang="ts">
// The popover editing a bookmark next to its row (useBookmarkEditor): one for the whole app,
// placed against the row it was opened from. Closed by Esc, a click outside, Done, or ↵.
const { editing, close } = useBookmarkEditor()
const open = computed({
  get: () => !!editing.value,
  set: (value) => {
    if (!value) close()
  },
})
</script>

<template>
  <UPopover
    v-model:open="open"
    :reference="editing?.anchor"
    :content="{ side: 'right', align: 'start', sideOffset: 8, collisionPadding: 12 }"
    :ui="{ content: 'w-80 p-3' }"
  >
    <template #content>
      <BookmarkFields v-if="editing" :id="editing.id" :key="editing.id" @done="close" />
    </template>
  </UPopover>
</template>
