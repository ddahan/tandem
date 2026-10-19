<script setup lang="ts">
// The landing page, in a fullscreen modal over the app (the sidebar's "About Tandem"). In a
// frame: the page keeps its own scrolling, fixed header and anchors. Its links into the app
// close the modal and go there (it posts `tandem:open`; Escape posts `tandem:close`, see
// landing.vue).
const open = defineModel<boolean>('open', { default: false })

function onMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return
  const data = event.data as { type?: string; to?: string } | null
  if (data?.type === 'tandem:close') open.value = false
  if (data?.type !== 'tandem:open' || typeof data.to !== 'string') return
  open.value = false
  if (data.to !== useRoute().fullPath) void navigateTo(data.to)
}
onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    title="About Tandem"
    :ui="{ body: 'flex p-0 sm:p-0', header: 'min-h-12 py-2 sm:py-2' }"
  >
    <template #body>
      <iframe
        src="/landing"
        title="About Tandem"
        class="min-h-0 w-full flex-1 border-0"
        data-testid="landing-frame"
      />
    </template>
  </UModal>
</template>
