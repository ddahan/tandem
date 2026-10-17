// The owner's settings (stored by the server) and their effect on the interface.
import { DEFAULT_SETTINGS, type Settings } from '@myfluence/shared'

const EDITOR_WIDTHS: Record<Settings['editorWidth'], string> = {
  narrow: '42rem',
  medium: '52rem',
  wide: '68rem',
  full: '100%',
}

const EDITOR_FONTS: Record<Settings['editorFont'], string> = {
  sans: 'var(--font-sans)',
  serif: 'var(--font-serif)',
  mono: 'var(--font-mono)',
  system: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

export function useSettings() {
  const settings = useState<Settings>('settings', () => ({ ...DEFAULT_SETTINGS }))
  const api = useApi()
  const appConfig = useAppConfig()

  function apply(value: Settings) {
    appConfig.ui.colors.primary = value.primaryColor
    appConfig.ui.colors.neutral = value.neutralColor
    const root = document.documentElement.style
    root.setProperty('--ui-radius', `${value.radius}rem`)
    root.setProperty('--editor-width', EDITOR_WIDTHS[value.editorWidth])
    root.setProperty('--editor-font', EDITOR_FONTS[value.editorFont])
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

  return { settings, load, update, apply }
}
