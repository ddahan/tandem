<script setup lang="ts">
// `/daily` (today) and `/daily/2026-10-21`: the day's note, created when it has none.
const route = useRoute()
const daily = useDaily()
onMounted(() => {
  const date = typeof route.params.date === 'string' ? route.params.date : undefined
  void daily.open(date, { replace: true })
})
</script>

<template>
  <UDashboardPanel id="daily">
    <template #body>
      <div class="flex h-full items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-dimmed" />
      </div>
    </template>
  </UDashboardPanel>
</template>
