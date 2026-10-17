// The Myfluence logo, drawn in a color scale (the accent color), for the sidebar and the
// browser tab. public/icon.svg is the same drawing in the default indigo (manifest, Dock icon).

export type LogoShade = 50 | 200 | 300 | 400 | 500 | 600

/** The logo's SVG; `shade(n)` gives the CSS color of shade n (a var() or a resolved color). */
export function logoSvg(shade: (n: LogoShade) => string, idPrefix = 'logo'): string {
  const bg = `${idPrefix}-bg`
  const page = `${idPrefix}-page`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="${bg}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style="stop-color:${shade(400)}"/>
      <stop offset="1" style="stop-color:${shade(600)}"/>
    </linearGradient>
    <linearGradient id="${page}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:#ffffff"/>
      <stop offset="1" style="stop-color:${shade(50)}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="114" fill="url(#${bg})"/>
  <path d="M170 112h116l84 84v196a28 28 0 0 1-28 28H170a28 28 0 0 1-28-28V140a28 28 0 0 1 28-28z" fill="url(#${page})"/>
  <path d="M286 112v58a26 26 0 0 0 26 26h58z" style="fill:${shade(200)}"/>
  <rect x="182" y="232" width="148" height="20" rx="10" style="fill:${shade(500)}"/>
  <rect x="182" y="276" width="118" height="20" rx="10" style="fill:${shade(300)}"/>
  <rect x="182" y="320" width="136" height="20" rx="10" style="fill:${shade(300)}"/>
  <path d="M394 300l12 30 30 12-30 12-12 30-12-30-30-12 30-12z" fill="#fde68a" stroke="#ffffff" stroke-width="8" stroke-linejoin="round"/>
</svg>`
}

/** Shades as CSS variables: follows the accent color live, for inline SVG. */
export const accentShade = (n: LogoShade) => `var(--ui-color-primary-${n})`

/** Shades resolved to colors (a data: URL can't use the page's CSS variables). */
export function resolvedAccentShade(n: LogoShade): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--ui-color-primary-${n}`)
    .trim()
}
