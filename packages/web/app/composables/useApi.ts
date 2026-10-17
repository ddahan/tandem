// The typed API client (Hono RPC, from the server package). The web app writes as the owner.
import { createClient, type Client } from '@myfluence/server/client'
import { OWNER } from '@myfluence/shared'

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${status})`
    super(message)
    this.status = status
    this.body = body
  }
}

let client: Client | null = null

export function useApi(): Client {
  client ??= createClient(window.location.origin, { author: OWNER })
  return client
}

type JsonOf<R> = R extends { json(): Promise<infer J> } ? J : never

/** Awaits a client call and returns its JSON, or throws an ApiError with the server's message. */
export async function unwrap<R extends { ok: boolean; status: number; json(): Promise<unknown> }>(
  request: Promise<R>,
): Promise<JsonOf<R>> {
  const response = await request
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, body)
  return body as JsonOf<R>
}

/** Shows an API error as a toast. */
export function useApiErrorToast() {
  const toast = useToast()
  return (error: unknown, title = 'Something went wrong') => {
    toast.add({
      title,
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
  }
}
