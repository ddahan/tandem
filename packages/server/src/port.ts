// The app's port, when another app holds it. Tandem starts at login, maybe after that app took
// the port: waiting for it beats crashing, which the login item would follow with a restart
// every 2 s, forever.
import { createServer } from 'node:net'

/** Whether nothing listens on the port (anything else than "in use" counts as free: `serve`
 * then reports it). */
export function portIsFree(port: number, hostname: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', (error: NodeJS.ErrnoException) => resolve(error.code !== 'EADDRINUSE'))
    probe.listen(port, hostname, () => probe.close(() => resolve(true)))
  })
}

/** Resolves once the port is free, saying once that it waits. */
export async function waitForPort(
  port: number,
  hostname: string,
  options: { intervalMs?: number; log?: (message: string) => void } = {},
): Promise<void> {
  if (port === 0) return
  const { intervalMs = 5000, log = console.log } = options
  let told = false
  while (!(await portIsFree(port, hostname))) {
    if (!told) {
      log(`Port ${port} is used by another app: Tandem starts as soon as it is free.`)
      told = true
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
