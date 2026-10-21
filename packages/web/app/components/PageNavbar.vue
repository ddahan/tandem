<script setup lang="ts">
// The bar above every page: the open tabs (TabBar) on its left, or the page's title when no tab
// is open (Home, at first), and the page's actions on its right (slot `right`). One bar: the
// tabs say which page shows, the path is in the tab's tooltip and above a note's title.
defineProps<{ title: string }>()
const tabs = useTabs()
</script>

<template>
  <UDashboardNavbar
    :title="tabs.tabs.value.length ? undefined : title"
    :ui="{ root: 'gap-3', left: 'min-w-0 flex-1 self-stretch' }"
  >
    <template v-if="tabs.tabs.value.length" #left>
      <TabBar class="flex-1" />
    </template>
    <template #right>
      <slot name="right" />
    </template>
  </UDashboardNavbar>
</template>
