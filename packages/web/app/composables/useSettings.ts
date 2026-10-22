// The owner's settings (stored by the server) and their effect on the interface.
import { DEFAULT_SETTINGS, type Settings } from '@tandem/shared'
import { logoSvg, resolvedAccentShade } from '~/utils/logo'

const EDITOR_WIDTHS: Record<Settings['editorWidth'], string> = {
  narrow: '42rem',
  medium: '52rem',
  wide: '68rem',
  full: '100%',
}

/** Text size of notes; headings, code and the title scale with it (em units in main.css). */
export const EDITOR_FONT_SIZES: Record<Settings['editorFontSize'], string> = {
  small: '15px',
  medium: '16px',
  large: '18px',
  xlarge: '20px',
}

const EDITOR_FONTS: Record<Settings['editorFont'], string> = {
  sans: 'var(--font-sans)',
  serif: 'var(--font-serif)',
  mono: 'var(--font-mono)',
  system: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

/**
 * The last settings seen, kept in the browser: applied before the first paint (plugin
 * `remembered-settings.client.ts`, and the head script for the tone), so a reload doesn't flash
 * the default theme while the server's settings load. The server's settings then replace them.
 */
const REMEMBERED = 'tandem-settings'

export function rememberedSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(REMEMBERED)
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : null
  } catch {
    return null
  }
}

function remember(value: Settings) {
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify(value))
  } catch {
    // Storage unavailable (private window…): the theme just loads a moment later.
  }
}

export function useSettings() {
  const settings = useState<Settings>('settings', () => ({ ...DEFAULT_SETTINGS }))
  const api = useApi()
  const appConfig = useAppConfig()
  /** The browser tab's icon: the logo in the accent color (see app.vue). */
  const favicon = useState('favicon', () => '/icon.svg')

  function updateFavicon() {
    if (!resolvedAccentShade(500)) return
    favicon.value = `data:image/svg+xml,${encodeURIComponent(logoSvg(resolvedAccentShade, 'favicon'))}`
  }

  function apply(value: Settings) {
    appConfig.ui.colors.primary = value.primaryColor
    appConfig.ui.colors.neutral = value.neutralColor
    const root = document.documentElement.style
    root.setProperty('--ui-radius', `${value.radius}rem`)
    root.setProperty('--editor-width', EDITOR_WIDTHS[value.editorWidth])
    root.setProperty('--editor-font-size', EDITOR_FONT_SIZES[value.editorFontSize])
    root.setProperty('--editor-font', EDITOR_FONTS[value.editorFont])
    // Background tones are defined in main.css, per tone and color mode.
    document.documentElement.dataset.tone = value.backgroundTone
    // Code themes too (see main.css).
    document.documentElement.dataset.codeTheme = value.codeTheme
    // Inherited by every text field and the editor (the Markdown source never checks: code).
    document.documentElement.spellcheck = value.spellcheck
    // TODO lines read as any text when TODOs are off (main.css).
    document.documentElement.dataset.todos = value.todos ? 'on' : 'off'
    // Shortcuts' keys hidden (main.css), except where Docs show them.
    document.documentElement.dataset.shortcutHints = value.shortcutHints ? 'on' : 'off'
    remember(value)
    void nextTick(() => requestAnimationFrame(updateFavicon))
  }

  async function load() {
    settings.value = await unwrap(api.settings.$get())
    apply(settings.value)
  }

  async function update(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch }
    apply(settings.value)
    settings.value = await unwrap(api.settings.$patch({ json: patch }))
  }

  return { settings, favicon, load, update, apply }
}

/** Saves a change to the settings, saying so when it fails (the Settings tabs). */
export function useSettingsSave() {
  const { update } = useSettings()
  const showError = useApiErrorToast()
  return async (patch: Partial<Settings>) => {
    try {
      await update(patch)
    } catch (error) {
      showError(error, 'Could not save the settings')
    }
  }
}
