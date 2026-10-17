// The browser's theme color (an installed app's title bar, Safari's tab bar) follows the page's
// background: the tone and neutral color from Settings, in light or dark mode.
//
// The `theme-color` meta tag is created by a head script (nuxt.config.ts) with the last color
// seen, so the app opens with it; this keeps it up to date and remembers it.
const REMEMBERED = 'myfluence-theme-color'

/** A CSS color as #rrggbb: browsers want sRGB for this, and the palette is in oklch. */
function toHex(color: string): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, '0')).join('')}`
}

function metaTag(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
  }
  return meta
}

/** Sets the theme color from the page's background, once the styles have caught up. */
function update() {
  requestAnimationFrame(() => {
    const color = toHex(getComputedStyle(document.body).backgroundColor)
    if (!color) return
    metaTag().content = color
    try {
      localStorage.setItem(REMEMBERED, color)
    } catch {
      // Storage unavailable: the next launch starts with the default color.
    }
  })
}

export function useThemeColor() {
  const { settings } = useSettings()
  const colorMode = useColorMode()

  watch(
    () => [settings.value.backgroundTone, settings.value.neutralColor, colorMode.value],
    () => void nextTick(update),
    { immediate: true },
  )
}
