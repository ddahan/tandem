// The icon of an attached file, from its extension (VS Code icons, bundled).
import { DEFAULT_FILE_ICON, FILE_ICON_BY_EXTENSION } from './file-icon-map'
import { FILE_ICON_SVGS } from './file-icons.generated'

/** `report.PDF`, `/files/a%20b.assets/x.csv?v=1` → the icon name for that extension. */
export function fileIconName(fileName: string): string {
  const path = fileName.split(/[?#]/)[0] ?? ''
  const base = path.split('/').pop() ?? ''
  const extension = base.includes('.') ? (base.split('.').pop()?.toLowerCase() ?? '') : ''
  return FILE_ICON_BY_EXTENSION[extension] ?? DEFAULT_FILE_ICON
}

export function fileIconSvg(fileName: string): string {
  return FILE_ICON_SVGS[fileIconName(fileName)] ?? FILE_ICON_SVGS[DEFAULT_FILE_ICON]!
}

/** A CSS `url()` of the icon (for backgrounds). */
export function fileIconCssUrl(fileName: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(fileIconSvg(fileName))}")`
}
