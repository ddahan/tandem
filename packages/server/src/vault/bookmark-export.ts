// Bookmarks as a browser's bookmarks file (the "Netscape" HTML every browser exports and
// imports: Chrome's Import bookmarks and settings › Bookmarks HTML file): folders as `<H3>`,
// bookmarks as `<A>` with their dates and favicon (a `data:` URL), descriptions as `<DD>`.
// Chrome reads it line by line: one element per line, and no line break inside a text.
import type { Bookmark } from '@tandem/shared'
import { escapeHtml } from './text.ts'

const HEAD = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>`

/** A text on one line, escaped. */
const text = (value: string) => escapeHtml(value.replace(/\s+/g, ' ').trim())
/** Seconds, as browsers write them. */
const seconds = (ms: number) => String(Math.floor(ms / 1000))

/**
 * The file for `all` bookmarks: everything, or the subtree of `rootId` (that folder or bookmark
 * included). `icons` has the favicons as `data:` URLs, by bookmark id.
 */
export function bookmarksHtml(
  all: Bookmark[],
  rootId: string | null,
  icons: Map<string, string>,
): string {
  const children = new Map<string | null, Bookmark[]>()
  for (const bookmark of all.toSorted((a, b) => a.position - b.position)) {
    const siblings = children.get(bookmark.parentId) ?? []
    siblings.push(bookmark)
    children.set(bookmark.parentId, siblings)
  }
  const lines = [HEAD]
  const list = (items: Bookmark[], depth: number) => {
    const indent = '    '.repeat(depth)
    lines.push(`${indent}<DL><p>`)
    for (const item of items) entry(item, depth + 1)
    lines.push(`${indent}</DL><p>`)
  }
  const entry = (item: Bookmark, depth: number) => {
    const indent = '    '.repeat(depth)
    const dates = `ADD_DATE="${seconds(item.createdAt)}" LAST_MODIFIED="${seconds(item.updatedAt)}"`
    if (item.kind === 'folder') {
      lines.push(`${indent}<DT><H3 ${dates}>${text(item.title)}</H3>`)
      list(children.get(item.id) ?? [], depth)
      return
    }
    const icon = icons.get(item.id)
    lines.push(
      `${indent}<DT><A HREF="${escapeHtml(item.url)}" ${dates}${icon ? ` ICON="${icon}"` : ''}>${text(item.title)}</A>`,
    )
    if (item.description.trim()) lines.push(`${indent}<DD>${text(item.description)}`)
  }
  const root = rootId === null ? undefined : all.find((bookmark) => bookmark.id === rootId)
  list(root ? [root] : (children.get(null) ?? []), 0)
  return `${lines.join('\n')}\n`
}
