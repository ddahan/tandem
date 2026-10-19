import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { portIsFree, waitForPort } from '../src/port.ts'

let holder: Server | null = null
afterEach(() => {
  holder?.close()
  holder = null
})

/** Another app holding a port: returns it. */
function holdPort(): Promise<number> {
  return new Promise((resolve) => {
    holder = createServer()
    holder.listen(0, '127.0.0.1', () => resolve((holder!.address() as { port: number }).port))
  })
}

describe('the app port', () => {
  it('tells a port in use by another app from a free one', async () => {
    const port = await holdPort()
    expect(await portIsFree(port, '127.0.0.1')).toBe(false)
    holder!.close()
    holder = null
    expect(await portIsFree(port, '127.0.0.1')).toBe(true)
  })

  it('waits for a busy port, saying it once, instead of failing', async () => {
    const port = await holdPort()
    const messages: string[] = []
    let ready = false
    const waiting = waitForPort(port, '127.0.0.1', {
      intervalMs: 20,
      log: (message) => messages.push(message),
    }).then(() => (ready = true))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(ready).toBe(false)
    holder!.close()
    holder = null
    await waiting
    expect(ready).toBe(true)
    expect(messages).toEqual([
      `Port ${port} is used by another app: Tandem starts as soon as it is free.`,
    ])
  })
})
