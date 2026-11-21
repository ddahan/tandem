<script setup lang="ts">
// A note's own window (useNoteWindow): the page alone, without the sidebar or the tab bar. A
// note that goes (trashed or deleted, here or elsewhere) closes its window, as it closes its tab
// in the main window (a window opened by the app may close itself).
const tree = useTree()
const route = useRoute()
watch(
  () => tree.byId.value,
  (byId) => {
    if (tree.loaded.value && route.name === 'notes-id' && !byId.has(String(route.params.id)))
      window.close()
  },
)
</script>

<template>
  <UDashboardGroup unit="rem">
    <slot />
  </UDashboardGroup>
</template>
