<script setup lang="ts">
// Loads the tree and settings once, then keeps them in sync with the server's events (the
// website, the landing page alone, has no server).
const tree = useTree()
const { settings, load: loadSettings, favicon } = useSettings()
useHead({
  // Pages set their own title; the workspace name follows it.
  titleTemplate: computed(() => `%s · ${settings.value.workspaceName}`),
  link: [{ key: 'favicon', rel: 'icon', type: 'image/svg+xml', href: favicon }],
})
useThemeColor()
const showError = useApiErrorToast()

// The website (TANDEM_SITE, nuxt.config.ts) has no server: the landing page alone.
if (!useRuntimeConfig().public.site) {
  try {
    await Promise.all([tree.refresh(), loadSettings()])
  } catch (error) {
    showError(error, 'Could not reach the Tandem server')
  }

  useServerEvents((event) => {
    if (event.type === 'tree' || event.type === 'resync') void tree.refresh()
    if (event.type === 'settings' || event.type === 'resync') void loadSettings()
  })
}
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right', duration: 4000 }" :tooltip="{ delayDuration: 400 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
