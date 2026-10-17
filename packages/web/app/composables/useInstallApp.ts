// Installing Myfluence as an app (PWA: public/manifest.webmanifest).
//
// - Chrome and Edge fire `beforeinstallprompt` once, early: a script in the page's head
//   (nuxt.config.ts) keeps it until the app starts, then the plugin `install-prompt.client.ts`
//   takes it over, and `install()` shows the browser's own install dialog.
// - Safari has no install API: `method` is 'safari' (macOS: File › Add to Dock…) or 'ios'
//   (Share › Add to Home Screen), and the interface shows those steps (InstallSteps.vue).
// - Other browsers can't install web apps: `method` is null, and so is it once installed (the
//   app runs in its own window, `display-mode: standalone`).
import { useLocalStorage, useMediaQuery } from '@vueuse/core'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Not in useState: a reactive proxy can't call the event's native methods.
const deferred = shallowRef<BeforeInstallPromptEvent | null>(null)
const justInstalled = ref(false)

/** Keeps the browser's install prompt for later (from the plugin, at startup). */
export function captureInstallPrompt() {
  const early = (window as Window & { myfluenceInstallPrompt?: BeforeInstallPromptEvent })
    .myfluenceInstallPrompt
  if (early) deferred.value = early
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred.value = event as BeforeInstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    deferred.value = null
    justInstalled.value = true
  })
}

/** Shows the browser's install dialog; true when the owner accepted. */
async function installApp(): Promise<boolean> {
  const event = deferred.value
  if (!event) return false
  await event.prompt()
  const { outcome } = await event.userChoice
  // A prompt can only be used once.
  deferred.value = null
  return outcome === 'accepted'
}

function safariPlatform(): 'safari' | 'ios' | null {
  const agent = navigator.userAgent
  if (!/Safari/.test(agent) || /Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(agent))
    return null
  const ios =
    /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
  return ios ? 'ios' : 'safari'
}

export function useInstallApp() {
  const standalone = useMediaQuery('(display-mode: standalone)')
  const installed = computed(
    () =>
      justInstalled.value ||
      standalone.value ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  )
  const method = computed<'prompt' | 'safari' | 'ios' | null>(() => {
    if (installed.value) return null
    if (deferred.value) return 'prompt'
    return safariPlatform()
  })
  /** The sidebar's banner was closed (the Settings page still offers to install). */
  const dismissed = useLocalStorage('myfluence-install-dismissed', false)

  return { method, installed, dismissed, install: installApp }
}
