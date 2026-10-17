// Watches the data folder for changes made outside the app (agents editing files, Finder,
// OneDrive) and reconciles the vault with them, in batches.
import { relative, sep } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import { isIgnoredName } from './vault/files.ts'
import type { Vault } from './vault/vault.ts'

export function watchVault(
  vault: Vault,
  options: { polling?: boolean; debounceMs?: number } = {},
): FSWatcher {
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | null = null

  const flush = () => {
    timer = null
    const paths = [...pending]
    pending.clear()
    vault.reconcile(paths).catch((error: unknown) => console.error('Reconcile failed', error))
  }

  const watcher = watch(vault.dataDir, {
    ignoreInitial: true,
    usePolling: options.polling ?? false,
    interval: 1000,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
    ignored: (path) => {
      const rel = relative(vault.dataDir, path)
      return rel !== '' && rel.split(sep).some(isIgnoredName)
    },
  })

  watcher.on('all', (_event, path) => {
    pending.add(relative(vault.dataDir, path).split(sep).join('/'))
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, options.debounceMs ?? 300)
  })
  watcher.on('error', (error) => console.error('Watcher error', error))
  return watcher
}
