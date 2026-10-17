// Catches the browser's install prompt as early as possible: it fires once, before most
// components mount (see useInstallApp).
export default defineNuxtPlugin(() => {
  captureInstallPrompt()
})
