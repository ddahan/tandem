// The Tandem logo: two pages written side by side, yours in front (its lines alternate between
// your color and the agent's sky blue, Claude's color in the app), the agent's behind. Drawn in
// a color scale (the accent color) for the sidebar and the browser tab; public/icon.svg and the
// PNG icons are the same drawing in the default amber (scripts/icons.ts).

export type LogoShade = 50 | 200 | 300 | 400 | 500 | 600

/** The logo's SVG; `shade(n)` gives the CSS color of shade n (a var() or a resolved color). */
export function logoSvg(shade: (n: LogoShade) => string, idPrefix = 'logo', radius = 114): string {
  const bg = `${idPrefix}-bg`
  const page = `${idPrefix}-page`
  const agent = `${idPrefix}-agent`
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
    <linearGradient id="${agent}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:#bae6fd"/>
      <stop offset="1" style="stop-color:#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#${bg})"/>
  <g transform="rotate(9 318 226)">
    <rect x="222" y="92" width="192" height="268" rx="30" fill="url(#${agent})"/>
    <rect x="254" y="150" width="96" height="20" rx="10" fill="#ffffff" opacity="0.7"/>
  </g>
  <g transform="rotate(-7 206 290)">
    <rect x="104" y="160" width="204" height="268" rx="30" fill="#000000" opacity="0.14" transform="translate(6 12)"/>
    <rect x="104" y="160" width="204" height="268" rx="30" fill="url(#${page})"/>
    <rect x="138" y="214" width="136" height="22" rx="11" style="fill:${shade(500)}"/>
    <rect x="138" y="262" width="104" height="22" rx="11" fill="#0ea5e9"/>
    <rect x="138" y="310" width="124" height="22" rx="11" style="fill:${shade(300)}"/>
    <rect x="138" y="358" width="80" height="22" rx="11" fill="#7dd3fc"/>
  </g>
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
