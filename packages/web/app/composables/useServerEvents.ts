// Live updates from the server (`/api/events`): one EventSource for the whole app. After a
// reconnection, listeners receive a `resync` event, since events may have been missed. The app
// announces some changes of its own too (`announce`): the server credits them to the owner,
// whose changes a note doesn't reload (they're its own saves).
import type { ServerEvent } from '@tandem/shared'

export type AppEvent =
  | ServerEvent
  | { type: 'resync' }
  /** Deleting a bookmark removed its cards from this page (as the owner, in this window). */
  | { type: 'cards-removed'; id: string }

const listeners = new Set<(event: AppEvent) => void>()
let source: EventSource | null = null

function connect() {
  if (source) return
  let disconnected = false
  source = new EventSource('/api/events')
  source.addEventListener('message', (message) => {
    if (!message.data) return
    const event = JSON.parse(message.data) as ServerEvent
    for (const listener of listeners) listener(event)
  })
  source.addEventListener('error', () => {
    disconnected = true
  })
  source.addEventListener('open', () => {
    if (!disconnected) return
    disconnected = false
    for (const listener of listeners) listener({ type: 'resync' })
  })
}

/** Sends an event of the app's own to every listener. */
export function announce(event: AppEvent) {
  for (const listener of listeners) listener(event)
}

/** Calls `handler` for every server event while the current component is mounted. */
export function useServerEvents(handler: (event: AppEvent) => void) {
  connect()
  listeners.add(handler)
  if (getCurrentScope()) onScopeDispose(() => listeners.delete(handler))
}
