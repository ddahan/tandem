<script setup lang="ts">
// The bar above every page: the open tabs (TabBar) on its left, or the page's title when no tab
// is open (Home, at first), and the page's actions on its right (slot `right`). One bar: the
// tabs say which page shows, the path is in the tab's tooltip and above a note's title.
// The tab bar itself is the layout's (one for the app): this bar only gives it its place.
defineProps<{ title: string }>()
const tabs = useTabs()
const host = useTabBarHost()

/** The tab bar's place in this page's bar; the last page mounted has it. */
function setHost(element: unknown) {
  if (element instanceof HTMLElement) host.value = element
}
</script>

<template>
  <UDashboardNavbar
    :title="tabs.tabs.value.length ? undefined : title"
    :ui="{ root: 'gap-3', left: 'min-w-0 flex-1 self-stretch' }"
  >
    <template v-if="tabs.tabs.value.length" #left>
      <div :ref="setHost" class="flex h-full min-w-0 flex-1" />
    </template>
    <template #right>
      <slot name="right" />
    </template>
  </UDashboardNavbar>
</template>
