// Applies the last settings seen before anything renders, and before Nuxt UI builds its color
// styles (enforce: 'pre'), so a reload shows the owner's theme at once (see useSettings).
export default defineNuxtPlugin({
  name: 'remembered-settings',
  enforce: 'pre',
  setup() {
    const remembered = rememberedSettings()
    if (!remembered) return
    const { settings, apply } = useSettings()
    settings.value = remembered
    apply(remembered)
  },
})
