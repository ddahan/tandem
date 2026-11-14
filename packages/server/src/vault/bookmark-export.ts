// Bookmarks as a browser's bookmarks file (the "Netscape" HTML every browser exports and
// imports: Chrome's Import bookmarks and settings › Bookmarks HTML file): folders as `<H3>`,
// bookmarks as `<A>` with their dates and favicon (a `data:` URL), descriptions as `<DD>`.
// Chrome reads it line by line: one element per line, and no line break inside a text.
// The folders are Tandem's pages: the vault gives the tree (`ExportFolder`).
import type { Bookmark } from '@tandem/shared'
import { escapeHtml } from './text.ts'

/** A folder of the file: a page (its cards, then its child pages), with its dates. */
export interface ExportFolder {
  title: string
  createdAt: number
  updatedAt: number
  bookmarks: Bookmark[]
  folders: ExportFolder[]
}

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
const dates = (item: { createdAt: number; updatedAt: number }) =>
  `ADD_DATE="${seconds(item.createdAt)}" LAST_MODIFIED="${seconds(item.updatedAt)}"`

/** The file for these folders, at the top. `icons` has the favicons as `data:` URLs, by id. */
export function bookmarksHtml(folders: ExportFolder[], icons: Map<string, string>): string {
  const lines = [HEAD]
  const list = (folder: Pick<ExportFolder, 'bookmarks' | 'folders'>, depth: number) => {
    const indent = '    '.repeat(depth)
    lines.push(`${indent}<DL><p>`)
    for (const item of folder.bookmarks) bookmark(item, depth + 1)
    for (const item of folder.folders) {
      lines.push(`${'    '.repeat(depth + 1)}<DT><H3 ${dates(item)}>${text(item.title)}</H3>`)
      list(item, depth + 1)
    }
    lines.push(`${indent}</DL><p>`)
  }
  const bookmark = (item: Bookmark, depth: number) => {
    const indent = '    '.repeat(depth)
    const icon = icons.get(item.id)
    lines.push(
      `${indent}<DT><A HREF="${escapeHtml(item.url)}" ${dates(item)}${icon ? ` ICON="${icon}"` : ''}>${text(item.title)}</A>`,
    )
    if (item.description.trim()) lines.push(`${indent}<DD>${text(item.description)}`)
  }
  list({ bookmarks: [], folders }, 0)
  return `${lines.join('\n')}\n`
}
