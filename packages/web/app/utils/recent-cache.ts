// A small in-memory cache of the last values used, by key: the oldest goes when it is full.
// Databases keep their last known state in one, so that a block shown again (a note reopened)
// draws at once while it reloads, instead of waiting for the server.

export class RecentCache<T> {
  private readonly entries = new Map<string, T>()
  private readonly size: number

  constructor(size: number) {
    this.size = size
  }

  get(key: string): T | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    // Used again: the most recent (a Map keeps the order things were set in).
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: T): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    if (this.entries.size > this.size) this.entries.delete(this.entries.keys().next().value!)
  }

  delete(key: string): void {
    this.entries.delete(key)
  }
}
