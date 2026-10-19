// A newer build of the app on the server (Tandem updated while a window was open, or a browser
// reopening a window with a page it kept): the window reloads, once nothing is left to save.
// Builds are told apart by Nuxt's build id (a new one for every build), published in
// `builds/latest.json`, so a reinstall of the same version counts too.

const unsaved = new Set<() => boolean>()

/** Holds reloads while `hasUnsavedChanges()` (an open note's pending save). */
export function holdReloads(hasUnsavedChanges: () => boolean): () => void {
  unsaved.add(hasUnsavedChanges)
  return () => unsaved.delete(hasUnsavedChanges)
}

// One reload per new build: if the browser still showed the old one after it, reloading again
// would never end.
const RELOADED = 'tandem-reloaded-for'
const RETRY_DELAY = 1000

let checking = false

/** Reloads the window when the server has another build than this one. */
export async function reloadIfOutdated(current: string, buildAssetsDir: string) {
  if (checking) return
  checking = true
  try {
    const response = await fetch(`${buildAssetsDir}builds/latest.json`, { cache: 'no-store' })
    if (!response.ok) return
    const { id } = (await response.json()) as { id?: string }
    if (!id || id === current || remembered() === id) return
    while ([...unsaved].some((hasUnsavedChanges) => hasUnsavedChanges())) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
    }
    remember(id)
    location.reload()
  } catch {
    // Server unreachable (restarting): the next check will tell.
  } finally {
    checking = false
  }
}

function remembered(): string | null {
  try {
    return sessionStorage.getItem(RELOADED)
  } catch {
    return null
  }
}

function remember(id: string) {
  try {
    sessionStorage.setItem(RELOADED, id)
  } catch {
    // Without storage, no guard: still better than an old version.
  }
}
