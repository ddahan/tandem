// Who wrote what. The owner writes from the web app; agents name themselves (CLI `--author`,
// `TANDEM_AUTHOR`, or the MCP `X-Tandem-Author` header); direct file edits are `external`.

export const OWNER = 'owner'
export const EXTERNAL = 'external'
export const DEFAULT_AGENT = 'agent'

/** Normalizes an author name: lowercase, `[a-z0-9._-]`, at most 40 characters. */
export function normalizeAuthor(
  input: string | null | undefined,
  fallback = DEFAULT_AGENT,
): string {
  const author = (input ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return author || fallback
}

/** Name to show for an author: the owner's display name, or the author as written. */
export function authorLabel(author: string, ownerName: string): string {
  if (author === OWNER) return ownerName || 'Me'
  if (author === EXTERNAL) return 'External edit'
  return author.charAt(0).toUpperCase() + author.slice(1)
}
