// Errors the API turns into HTTP statuses (404, 409, 400).
import type { Bookmark } from '@tandem/shared'

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

/** A page that is already bookmarked: its bookmark comes along (the extension edits it). */
export class DuplicateBookmarkError extends ConflictError {
  override name = 'DuplicateBookmarkError'
  readonly bookmark: Bookmark

  constructor(bookmark: Bookmark) {
    super(`Already bookmarked as “${bookmark.title}”`)
    this.bookmark = bookmark
  }
}

export class ValidationError extends Error {
  override name = 'ValidationError'
}
