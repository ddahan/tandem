<script setup lang="ts">
import type { Settings } from '@myfluence/shared'

const { settings, update } = useSettings()
const colorMode = useColorMode()
const showError = useApiErrorToast()
useHead({ title: 'Settings · Myfluence' })

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
const modes = [
  { value: 'light', label: 'Light', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' },
  { value: 'system', label: 'System', icon: 'i-lucide-monitor' },
]

const displayName = ref(settings.value.displayName)
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

          <UFormField label="Theme">
            <div class="flex gap-2">
              <UButton
                v-for="mode in modes"
                :key="mode.value"
                :label="mode.label"
                :icon="mode.icon"
                color="neutral"
                :variant="colorMode.preference === mode.value ? 'soft' : 'outline'"
                @click="colorMode.preference = mode.value"
              />
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
        </section>

        <USeparator />

        <section class="space-y-2 text-sm text-muted">
          <h2 class="font-semibold text-highlighted">For agents</h2>
          <p>Agents can use Myfluence through its MCP server:</p>
          <pre
            class="overflow-x-auto rounded-md border border-muted bg-muted p-3 text-xs"
          ><code>claude mcp add --transport http myfluence http://localhost:3000/mcp --header "X-Myfluence-Author: claude"</code></pre>
          <p>Or with the <code>bin/myfluence</code> CLI of the repository. See the README.</p>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
