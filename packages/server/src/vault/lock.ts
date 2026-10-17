// A FIFO async lock. Every operation that changes files or the database runs inside it, so that
// concurrent requests (the web app, agents, the file watcher) never interleave half-way.

export class Lock {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.catch(() => undefined)
    return result
  }
}
