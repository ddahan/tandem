// What the extension reads from the page and the browser to bookmark it: the page's description
// (its meta tags, read in the page), its favicon (Chrome's own copy), and whether it can be
// bookmarked at all (web pages only).
import { BOOKMARK_DESCRIPTION_MAX, webUrl } from '@tandem/shared'

/**
 * Runs in the page (chrome.scripting): its description, from its meta tags. Self-contained: the
 * browser sends the function's source to the page, without anything around it.
 */
export function readDescription(): string {
  const metas = [...document.querySelectorAll('meta')]
  const content = (key: string) =>
    metas
      .find(
        (meta) =>
          (meta.getAttribute('name') ?? meta.getAttribute('property'))?.toLowerCase() === key,
      )
      ?.getAttribute('content')
      ?.replace(/\s+/g, ' ')
      .trim() ?? ''
  return content('description') || content('og:description') || content('twitter:description')
}

/** The tab's page, when it's a web page (http, https). */
export function bookmarkable(url: string | undefined): string | null {
  return url ? webUrl(url) : null
}

/** The page's description, or nothing when the page can't be read (the Web Store, an error). */
export async function pageDescription(tabId: number): Promise<string> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readDescription,
    })
    return String(result?.result ?? '').slice(0, BOOKMARK_DESCRIPTION_MAX)
  } catch {
    return ''
  }
}

const MAX_ICON_BYTES = 256 * 1024

/**
 * The page's favicon as a `data:` URL: the tab's own when it is one, otherwise Chrome's copy
 * (its `_favicon` service, which needs no access to the site).
 */
export async function faviconDataUrl(
  pageUrl: string,
  tabIcon: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  if (tabIcon?.startsWith('data:image/')) return tabIcon
  const source = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=64`)
  try {
    const response = await fetcher(source)
    const blob = await response.blob()
    if (!response.ok || !blob.type.startsWith('image/') || blob.size > MAX_ICON_BYTES) return
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return `data:${blob.type};base64,${btoa(binary)}`
  } catch {
    return undefined
  }
}
