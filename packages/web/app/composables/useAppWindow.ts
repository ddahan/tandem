// Whether Tandem runs in the installed app's own window (Chrome's app, Safari's Add to Dock):
// there, no browser keeps ⌘N, ⌘T, ⌘W, ⌘⇧T, ⌥⌘← ⌥⌘→ for itself, so they reach Tandem, and the
// app shows them (in a browser tab, it shows the keys that work there: utils/shortcuts.ts).
import { useMediaQuery } from '@vueuse/core'

export function useAppWindow() {
  const standalone = useMediaQuery('(display-mode: standalone)')
  return computed(
    () =>
      standalone.value || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  )
}
