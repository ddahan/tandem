// A note's title is its file name (without `.md`), so titles must be valid file names on macOS,
// Windows (OneDrive syncs there too) and Linux (the container).

// oxlint-disable-next-line no-control-regex -- control characters are exactly what is forbidden
const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f]/g
const MAX_LENGTH = 120

/** Turns any text into a usable title: forbidden characters become `-`. Empty → `Untitled`. */
export function sanitizeTitle(input: string): string {
  let title = input.replace(FORBIDDEN, '-').replace(/\s+/g, ' ').trim()
  // Leading dots would hide the file; trailing dots and spaces are invalid on Windows.
  title = title.replace(/^\.+/, '').replace(/[. ]+$/, '')
  // `Foo.assets` is the attachments folder of `Foo`, and `.md` would double the extension.
  title = title.replace(/\.(assets|md)$/i, '')
  if (title.length > MAX_LENGTH) title = title.slice(0, MAX_LENGTH).trim()
  return title || 'Untitled'
}

/** `Projects/Foo.md` → `Foo`; `Projects` → `Projects`. */
export function titleFromPath(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.endsWith('.md') ? base.slice(0, -3) : base
}

/** Folder of a page's attachments: `Projects/Foo.md` → `Projects/Foo.assets`. */
export function assetsDirOf(pagePath: string): string {
  return pagePath.replace(/\.md$/, '.assets')
}

/** Folder of a page's child pages: `Projects/Foo.md` → `Projects/Foo`. */
export function childrenDirOf(pagePath: string): string {
  return pagePath.replace(/\.md$/, '')
}

/** Parent folder of a path (`''` at the root). */
export function dirnameOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])

export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(name.split('.').pop()?.toLowerCase() ?? '')
}

/** Encodes a relative path for a Markdown link: each segment URL-encoded, `/` kept. */
export function encodeMarkdownPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function decodeMarkdownPath(path: string): string {
  try {
    return path
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/')
  } catch {
    return path
  }
}
