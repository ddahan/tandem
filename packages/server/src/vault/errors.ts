// Errors the API turns into HTTP statuses (404, 409, 400).

export class NotFoundError extends Error {
  override name = 'NotFoundError'
}

export class ConflictError extends Error {
  override name = 'ConflictError'
  /** For content conflicts: the content and hash currently on disk. */
  readonly current?: { content: string; hash: string }

  constructor(message: string, current?: { content: string; hash: string }) {
    super(message)
    this.current = current
  }
}

export class ValidationError extends Error {
  override name = 'ValidationError'
}
