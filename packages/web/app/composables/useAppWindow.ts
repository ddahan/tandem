// Where Tandem runs, for the keys it shows: a browser tab, the app installed from Chrome (or
// Edge, Brave…: its own window), or Safari's Add to Dock app. Only the installed app's window
// lets ⌘N, ⌘T, ⌘W, ⌘⇧T, ⌥⌘← ⌥⌘→ (and ⌥⌘↑ ⌥⌘↓) reach Tandem, so only it shows them
// (utils/shortcuts.ts). A browser tab keeps them for its tabs; Safari's app keeps some for its
// windows (⌘N, ⌘W, ⌥⌘← ⌥⌘→), so it shows the keys of a browser tab, which work there too.
import { useMediaQuery } from '@vueuse/core'
import { isSafari } from '~/utils/platform-keys'

export type WindowKind = 'tab' | 'app' | 'safariApp'

export function useWindowKind() {
  const standalone = useMediaQuery('(display-mode: standalone)')
  return computed<WindowKind>(() => {
    const own =
      standalone.value || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!own) return 'tab'
    return isSafari() ? 'safariApp' : 'app'
  })
}

/** Whether the keys a browser keeps for itself reach Tandem here: the installed app's window. */
export function useAppWindow() {
  const kind = useWindowKind()
  return computed(() => kind.value === 'app')
}
