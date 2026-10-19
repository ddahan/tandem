// Checks for a newer build of the app (see utils/app-update): at start, when the browser shows
// a page it kept (back/forward, a reopened window), when the window comes back into view, and
// when the server is back after a restart (an update restarts it).
export default defineNuxtPlugin(() => {
  const { buildId, buildAssetsDir } = useRuntimeConfig().app
  const check = () => void reloadIfOutdated(buildId, buildAssetsDir)

  check()
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) check()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  useServerEvents((event) => {
    if (event.type === 'resync') check()
  })
})
