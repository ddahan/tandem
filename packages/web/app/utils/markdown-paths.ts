// Notes reference their attachments with paths relative to the note (`Note.assets/a.png`), as
// in any Markdown editor. The app serves files at `/files/<path from the data folder>`, so
// relative paths are made absolute for the editor, and back on save.
import { dirnameOf, encodeMarkdownPath } from '@tandem/shared'

const LINK_TARGET = /(\]\(<?|\bsrc=")([^)>"\s]+)/g

function isRelative(url: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url)
}

/** `/files/<encoded folder of the note>/` */
export function filesPrefix(notePath: string): string {
  const dir = dirnameOf(notePath)
  return `/files/${dir ? `${encodeMarkdownPath(dir)}/` : ''}`
}

export function toEditorMarkdown(markdown: string, notePath: string): string {
  const prefix = filesPrefix(notePath)
  return markdown.replace(LINK_TARGET, (all, opening: string, url: string) =>
    isRelative(url) ? `${opening}${prefix}${url.replace(/^\.\//, '')}` : all,
  )
}

export function fromEditorMarkdown(markdown: string, notePath: string): string {
  const prefix = filesPrefix(notePath)
  return markdown.replace(LINK_TARGET, (all, opening: string, url: string) =>
    url.startsWith(prefix) ? `${opening}${url.slice(prefix.length)}` : all,
  )
}

// A list item with nothing in it (the editor writes its marker alone).
const EMPTY_LIST_ITEM = /^[ \t]*(?:[-*+]|\d+[.)])(?: \[[ xX]\])?[ \t]*$\n?/gm

/**
 * Tidies the editor's Markdown before saving: no blank lines at the start, at most one blank
 * line between blocks (the editor adds some around tables and empty paragraphs), one final
 * newline, no empty list items (Markdown can't keep them: an empty sub-item right under its
 * parent's text reads back as a heading, an empty numbered item disappears). Fenced code and
 * trailing spaces (hard line breaks) are left untouched.
 */
export function normalizeMarkdown(markdown: string): string {
  const parts = markdown.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[ \t]*$)/m)
  const tidy = parts
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(EMPTY_LIST_ITEM, '')
            .replace(/^[ \t]+$/gm, '')
            .replace(/\n{3,}/g, '\n\n'),
    )
    .join('')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '')
  return tidy ? `${tidy}\n` : ''
}
