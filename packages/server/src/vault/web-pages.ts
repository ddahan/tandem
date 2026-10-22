// What a web page says about itself, for bookmarks made in Tandem or by agents (the browser
// extension sends what the browser already has): its title, description and favicon. Best
// effort, with short timeouts and size limits: a page that can't be read leaves the fields to
// fill by hand, and a bookmark without a favicon shows a globe.
import type { PagePreview } from '@tandem/shared'

export type Fetcher = typeof fetch

const TIMEOUT_MS = 5000
const MAX_PAGE_BYTES = 1024 * 1024
const MAX_ICON_BYTES = 512 * 1024

/** Image types a favicon may have, and the file extension they're kept with. */
export const ICON_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

async function get(fetcher: Fetcher, url: string, accept: string): Promise<Response> {
  return fetcher(url, {
    headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; Tandem bookmarks)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/** The response's body, or null beyond `max` bytes. */
async function bodyOf(response: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > max) return null
  const data = new Uint8Array(await response.arrayBuffer())
  return data.byteLength > max ? null : data
}

interface ReadPage {
  preview: PagePreview
  /** Its favicons, as declared (`<link rel="icon">`), absolute. */
  icons: string[]
}

async function readPage(fetcher: Fetcher, url: string): Promise<ReadPage> {
  const empty = { preview: { url, title: '', description: '' }, icons: [] }
  const response = await get(fetcher, url, 'text/html,application/xhtml+xml')
  if (!response.ok || !/html/i.test(response.headers.get('content-type') ?? '')) return empty
  const data = await bodyOf(response, MAX_PAGE_BYTES)
  if (!data) return empty
  // The head is enough, and pages can be long.
  const html = new TextDecoder().decode(data).split(/<\/head>/i)[0] ?? ''
  const base = response.url || url
  return {
    preview: {
      url,
      title: decodeEntities(
        metaContent(html, 'og:title') ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '',
      )
        .replace(/\s+/g, ' ')
        .trim(),
      description: decodeEntities(
        metaContent(html, 'description') ?? metaContent(html, 'og:description') ?? '',
      )
        .replace(/\s+/g, ' ')
        .trim(),
    },
    icons: iconLinks(html, base),
  }
}

/** A page's title and description (empty when it can't be read). */
export async function previewPage(fetcher: Fetcher, url: string): Promise<PagePreview> {
  try {
    return (await readPage(fetcher, url)).preview
  } catch {
    return { url, title: '', description: '' }
  }
}

export interface Favicon {
  data: Uint8Array
  extension: string
}

/**
 * What a bookmark needs from its page, read once: its title and description, and (unless
 * `favicon` is false) its favicon, the first declared one that loads or `/favicon.ico`.
 */
export async function readSite(
  fetcher: Fetcher,
  url: string,
  options: { favicon?: boolean } = {},
): Promise<{ preview: PagePreview; favicon: Favicon | null }> {
  let page: ReadPage = { preview: { url, title: '', description: '' }, icons: [] }
  try {
    page = await readPage(fetcher, url)
  } catch {
    // The page didn't load: maybe its icon does.
  }
  if (options.favicon === false) return { preview: page.preview, favicon: null }
  return {
    preview: page.preview,
    favicon: await firstIcon(fetcher, [...page.icons, new URL('/favicon.ico', url).href]),
  }
}

async function firstIcon(fetcher: Fetcher, candidates: string[]): Promise<Favicon | null> {
  for (const candidate of candidates) {
    try {
      const response = await get(fetcher, candidate, 'image/*')
      const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
      const extension = ICON_TYPES[type]
      if (!response.ok || !extension) continue
      const data = await bodyOf(response, MAX_ICON_BYTES)
      if (data?.byteLength) return { data, extension }
    } catch {
      // The next one.
    }
  }
  return null
}

/** The `content` of `<meta name|property="…">`. */
function metaContent(html: string, name: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attribute(tag, 'name') ?? attribute(tag, 'property')
    if (key?.toLowerCase() === name) return attribute(tag, 'content')
  }
  return null
}

/** `<link rel="icon">` addresses (not Safari's `mask-icon`), absolute, http(s) only. */
function iconLinks(html: string, base: string): string[] {
  const result: string[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attribute(tag, 'rel')?.toLowerCase().split(/\s+/) ?? []
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue
    const href = attribute(tag, 'href')
    if (!href) continue
    try {
      const url = new URL(decodeEntities(href), base)
      if (url.protocol === 'http:' || url.protocol === 'https:') result.push(url.href)
    } catch {
      // A broken address.
    }
  }
  // Small icons first (`icon`), Apple's large ones last.
  return result.toSorted((a, b) => Number(/apple/i.test(a)) - Number(/apple/i.test(b)))
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const value =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(value) && value > 0 && value < 0x110000
        ? String.fromCodePoint(value)
        : entity
    }
    return ENTITIES[code.toLowerCase()] ?? entity
  })
}
