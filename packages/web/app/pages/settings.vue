<script setup lang="ts">
import { DEFAULT_SETTINGS, type NotesFolder, type Settings } from '@tandem/shared'
import { EDITOR_FONT_SIZES } from '~/composables/useSettings'
import { accentShade, logoSvg } from '~/utils/logo'

const { settings, update } = useSettings()
const colorMode = useColorMode()
const showError = useApiErrorToast()
/** This build's version (nuxt.config.ts); the dev servers say so. */
const version = useRuntimeConfig().public.version
const dev = import.meta.dev
useHead({ title: 'Settings' })

const PRIMARY = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
]
const NEUTRAL = ['slate', 'gray', 'zinc', 'neutral', 'stone']
const RADII = [0, 0.125, 0.25, 0.375, 0.5, 0.75]

const fonts: { value: Settings['editorFont']; label: string; family: string }[] = [
  { value: 'sans', label: 'Inter', family: 'var(--font-sans)' },
  { value: 'serif', label: 'Literata', family: 'var(--font-serif)' },
  { value: 'mono', label: 'JetBrains Mono', family: 'var(--font-mono)' },
  { value: 'system', label: 'System', family: 'ui-sans-serif, -apple-system, sans-serif' },
]
const widths: { value: Settings['editorWidth']; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
  { value: 'full', label: 'Full' },
]
// Previews of the background tones (the real colors are in main.css): light and dark.
const tones: { value: Settings['backgroundTone']; label: string; light: string; dark: string }[] = [
  { value: 'white', label: 'White', light: '#ffffff', dark: 'var(--color-neutral-900)' },
  { value: 'paper', label: 'Paper', light: '#fbf8f1', dark: '#1e1c19' },
  { value: 'sepia', label: 'Sepia', light: '#f5edda', dark: '#221d16' },
  { value: 'cool', label: 'Cool', light: '#f7f9fc', dark: '#161b22' },
]
const sizes: { value: Settings['editorFontSize']; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra large' },
]
// Each theme is a light and a dark variant, shown in its mode (as the background tones).
const codeThemes: { value: Settings['codeTheme']; label: string; variants: string }[] = [
  { value: 'tandem', label: 'Tandem', variants: 'Light and dark' },
  { value: 'github', label: 'GitHub', variants: 'Light and dark' },
  { value: 'one', label: 'One', variants: 'One Light, One Dark' },
  { value: 'dracula', label: 'Dracula', variants: 'Alucard, Dracula' },
  { value: 'nord', label: 'Nord', variants: 'Snow Storm, Nord' },
  { value: 'solarized', label: 'Solarized', variants: 'Light and dark' },
  { value: 'tomorrow', label: 'Tomorrow', variants: 'Tomorrow, Night Eighties' },
]
const modes = [
  { value: 'light', label: 'Light', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' },
  { value: 'system', label: 'System', icon: 'i-lucide-monitor' },
]
/** The colors of the theme previews: a light window, then a dark one. */
const WINDOWS = [
  { background: '#ffffff', sidebar: '#f4f4f5', text: '#a1a1aa', line: '#e4e4e7' },
  { background: '#18181b', sidebar: '#27272a', text: '#71717a', line: '#3f3f46' },
] as const

const install = useInstallApp()
const installLogo = logoSvg(accentShade, 'install-settings-logo')

const api = useApi()
const notesFolder = ref<NotesFolder | null>(null)
const pickerOpen = ref(false)
onMounted(async () => {
  notesFolder.value = await unwrap(api['notes-folder'].$get()).catch(() => null)
})

const workspaceName = ref(settings.value.workspaceName)
const displayName = ref(settings.value.displayName)
function saveWorkspaceName() {
  workspaceName.value = workspaceName.value.trim() || DEFAULT_SETTINGS.workspaceName
  void set({ workspaceName: workspaceName.value })
}
async function set(patch: Partial<Settings>) {
  try {
    await update(patch)
  } catch (error) {
    showError(error, 'Could not save the settings')
  }
}
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl space-y-10 py-4">
        <section>
          <h2 class="font-semibold text-highlighted">Version</h2>
          <p class="text-sm text-muted">
            Tandem
            <span class="font-mono text-default" data-testid="app-version">{{ version }}</span
            ><template v-if="dev"> (development)</template>
          </p>
        </section>

        <USeparator />

        <section>
          <h2 class="font-semibold text-highlighted">Workspace</h2>
          <p class="mb-4 text-sm text-muted">Shown next to the logo and in the browser tab.</p>
          <UFormField label="Workspace name">
            <UInput
              v-model="workspaceName"
              class="w-64"
              maxlength="40"
              @change="saveWorkspaceName"
            />
          </UFormField>
        </section>

        <USeparator />

        <section>
          <h2 class="font-semibold text-highlighted">Notes folder</h2>
          <p class="mb-4 text-sm text-muted">Where your notes are, as Markdown files.</p>
          <div class="flex flex-wrap items-center gap-3" data-testid="notes-folder">
            <code
              class="max-w-full truncate rounded-md border border-muted bg-muted px-2 py-1 text-sm text-highlighted"
              >{{ notesFolder?.path ?? '…' }}</code
            >
            <UButton
              v-if="notesFolder && !notesFolder.readOnlyReason"
              label="Change…"
              icon="i-lucide-folder-open"
              color="neutral"
              variant="outline"
              @click="pickerOpen = true"
            />
          </div>
          <p v-if="notesFolder?.readOnlyReason" class="mt-2 text-xs text-muted">
            {{ notesFolder.readOnlyReason }}
          </p>
          <NotesFolderPicker
            v-if="notesFolder"
            v-model:open="pickerOpen"
            :current="notesFolder.path"
          />
        </section>

        <USeparator />

        <section>
          <h2 class="font-semibold text-highlighted">You</h2>
          <p class="mb-4 text-sm text-muted">
            Shown in the history and authorship views for what you write.
          </p>
          <UFormField label="Display name">
            <UInput
              v-model="displayName"
              class="w-64"
              @change="set({ displayName: displayName.trim() || 'Me' })"
            />
          </UFormField>
        </section>

        <USeparator />

        <section class="space-y-6">
          <div>
            <h2 class="font-semibold text-highlighted">Appearance</h2>
            <p class="text-sm text-muted">Saved with your notes, so it follows the data folder.</p>
          </div>

          <UFormField label="Theme" description="Light, dark, or as the computer is set.">
            <div class="grid grid-cols-3 gap-2 sm:max-w-md">
              <button
                v-for="mode in modes"
                :key="mode.value"
                type="button"
                class="rounded-lg border border-default p-1.5 text-start transition-colors hover:bg-elevated"
                :class="colorMode.preference === mode.value && 'border-primary ring-1 ring-primary'"
                :aria-label="`Theme: ${mode.label}`"
                :aria-pressed="colorMode.preference === mode.value"
                @click="colorMode.preference = mode.value"
              >
                <!-- A tiny window in that mode (System: half each). -->
                <span class="flex h-14 overflow-hidden rounded-md border border-default">
                  <span
                    v-for="side in mode.value === 'system'
                      ? WINDOWS
                      : mode.value === 'dark'
                        ? [WINDOWS[1]]
                        : [WINDOWS[0]]"
                    :key="side.background"
                    class="flex flex-1 gap-1 p-1.5"
                    :style="{ background: side.background }"
                  >
                    <span class="w-1/4 rounded-sm" :style="{ background: side.sidebar }" />
                    <span class="flex flex-1 flex-col gap-1 pt-0.5">
                      <span class="h-1.5 w-3/4 rounded-full" :style="{ background: side.text }" />
                      <span class="h-1 w-full rounded-full" :style="{ background: side.line }" />
                      <span class="h-1 w-5/6 rounded-full" :style="{ background: side.line }" />
                    </span>
                  </span>
                </span>
                <span class="mt-1.5 flex items-center gap-1.5 px-0.5 text-xs text-muted">
                  <UIcon :name="mode.icon" class="size-3.5" />
                  {{ mode.label }}
                </span>
              </button>
            </div>
          </UFormField>

          <UFormField
            label="Background"
            description="A tint for the whole window, in light and dark mode."
          >
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="tone in tones"
                :key="tone.value"
                type="button"
                class="rounded-lg border border-default p-1.5 text-start transition-colors hover:bg-elevated"
                :class="
                  settings.backgroundTone === tone.value && 'border-primary ring-1 ring-primary'
                "
                :aria-label="`Background: ${tone.label}`"
                @click="set({ backgroundTone: tone.value })"
              >
                <span class="flex h-12 overflow-hidden rounded-md border border-default">
                  <span class="flex-1" :style="{ background: tone.light }" />
                  <span class="flex-1" :style="{ background: tone.dark }" />
                </span>
                <span class="mt-1.5 block px-0.5 text-xs text-muted">{{ tone.label }}</span>
              </button>
            </div>
          </UFormField>

          <UFormField label="Accent color">
            <div class="flex flex-wrap gap-2">
              <UTooltip v-for="color in PRIMARY" :key="color" :text="color">
                <button
                  type="button"
                  class="size-7 rounded-full ring-offset-2 ring-offset-default transition-transform hover:scale-110"
                  :class="settings.primaryColor === color && 'ring-2 ring-(--ui-text-highlighted)'"
                  :style="{ background: `var(--color-${color}-500)` }"
                  :aria-label="color"
                  @click="set({ primaryColor: color })"
                />
              </UTooltip>
            </div>
          </UFormField>

          <UFormField label="Gray tone">
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="color in NEUTRAL"
                :key="color"
                :label="color"
                color="neutral"
                :variant="settings.neutralColor === color ? 'soft' : 'outline'"
                class="capitalize"
                @click="set({ neutralColor: color })"
              >
                <template #leading>
                  <span
                    class="size-3 rounded-full"
                    :style="{ background: `var(--color-${color}-500)` }"
                  />
                </template>
              </UButton>
            </div>
          </UFormField>

          <UFormField label="Corner radius">
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="radius in RADII"
                :key="radius"
                :label="String(radius)"
                color="neutral"
                :variant="settings.radius === radius ? 'soft' : 'outline'"
                @click="set({ radius })"
              />
            </div>
          </UFormField>
        </section>

        <USeparator />

        <section class="space-y-6">
          <h2 class="font-semibold text-highlighted">Editor</h2>
          <UFormField label="Font">
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="font in fonts"
                :key="font.value"
                type="button"
                class="rounded-lg border border-default p-3 text-start transition-colors hover:bg-elevated"
                :class="settings.editorFont === font.value && 'border-primary ring-1 ring-primary'"
                @click="set({ editorFont: font.value })"
              >
                <span class="block text-2xl text-highlighted" :style="{ fontFamily: font.family }"
                  >Aa</span
                >
                <span class="text-xs text-muted">{{ font.label }}</span>
              </button>
            </div>
          </UFormField>
          <UFormField label="Text size" description="In notes only; the interface keeps its size.">
            <div class="flex flex-wrap items-end gap-2">
              <UButton
                v-for="size in sizes"
                :key="size.value"
                color="neutral"
                :variant="settings.editorFontSize === size.value ? 'soft' : 'outline'"
                :aria-label="`Text size: ${size.label}`"
                @click="set({ editorFontSize: size.value })"
              >
                <span :style="{ fontSize: EDITOR_FONT_SIZES[size.value] }">Aa</span>
                <span class="text-xs text-muted">{{ size.label }}</span>
              </UButton>
            </div>
          </UFormField>
          <UFormField label="Page width">
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="width in widths"
                :key="width.value"
                :label="width.label"
                color="neutral"
                :variant="settings.editorWidth === width.value ? 'soft' : 'outline'"
                @click="set({ editorWidth: width.value })"
              />
            </div>
          </UFormField>
          <UFormField
            label="Code blocks"
            description="Colors of code: each theme has a light and a dark variant, as the background."
          >
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="theme in codeThemes"
                :key="theme.value"
                type="button"
                class="rounded-lg border border-default p-1.5 text-start transition-colors hover:bg-elevated"
                :class="settings.codeTheme === theme.value && 'border-primary ring-1 ring-primary'"
                :aria-label="`Code theme: ${theme.label}`"
                :title="theme.variants"
                @click="set({ codeTheme: theme.value })"
              >
                <!-- Each half carries one variant's colors (data-code-preview, main.css). -->
                <span
                  class="flex overflow-hidden rounded-md border border-default"
                  aria-hidden="true"
                >
                  <span
                    v-for="mode in ['light', 'dark']"
                    :key="mode"
                    :data-code-preview="`${theme.value}-${mode}`"
                    class="block min-w-0 flex-1 overflow-hidden px-1.5 py-1 font-mono text-[10px] leading-relaxed whitespace-nowrap"
                    :style="{ background: 'var(--code-bg)', color: 'var(--code-fg)' }"
                  >
                    <span class="block italic" :style="{ color: 'var(--code-comment)' }"
                      >// Hi</span
                    >
                    <span class="block"
                      ><span :style="{ color: 'var(--code-keyword)' }">def&nbsp;</span
                      ><span :style="{ color: 'var(--code-title)' }">hi</span>(<span
                        :style="{ color: 'var(--code-params)' }"
                        >n</span
                      >):</span
                    >
                    <span class="block"
                      >&nbsp;<span :style="{ color: 'var(--code-builtin)' }">len</span>(<span
                        :style="{ color: 'var(--code-string)' }"
                        >'a'</span
                      >)</span
                    >
                  </span>
                </span>
                <span class="mt-1.5 block truncate px-0.5 text-xs text-muted">{{
                  theme.label
                }}</span>
              </button>
            </div>
          </UFormField>
        </section>

        <USeparator />

        <section>
          <h2 class="font-semibold text-highlighted">App</h2>
          <p class="mb-4 text-sm text-muted">
            Install Tandem to open it from your Dock, in its own window.
          </p>
          <div class="flex items-start gap-4" data-testid="install-settings">
            <!-- eslint-disable-next-line vue/no-v-html -- our own static drawing -->
            <span
              class="size-12 shrink-0 overflow-hidden rounded-[22%] shadow-sm [&_svg]:size-full"
              v-html="installLogo"
            />
            <p
              v-if="install.installed.value"
              class="flex items-center gap-1.5 pt-3 text-sm text-default"
            >
              <UIcon name="i-lucide-circle-check" class="size-4 text-primary" /> Installed: you're
              using the app.
            </p>
            <UButton
              v-else-if="install.method.value === 'prompt'"
              label="Install Tandem"
              icon="i-lucide-download"
              class="mt-2"
              @click="install.install()"
            />
            <InstallSteps
              v-else-if="install.method.value"
              :platform="install.method.value"
              class="pt-1"
            />
            <p v-else class="pt-1 text-sm text-muted">
              Your browser isn't offering to install Tandem (it may be installed already). Chrome,
              Edge and Safari can install it.
            </p>
          </div>
        </section>

        <USeparator />

        <section class="space-y-2 text-sm text-muted">
          <h2 class="font-semibold text-highlighted">For agents</h2>
          <p>Agents can use Tandem through its MCP server:</p>
          <pre
            class="overflow-x-auto rounded-md border border-muted bg-muted p-3 text-xs"
          ><code>claude mcp add --transport http tandem http://localhost:3000/mcp --header "X-Tandem-Author: claude"</code></pre>
          <p>Or with the <code>bin/tandem</code> CLI of the repository. See the README.</p>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
