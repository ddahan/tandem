<script setup lang="ts">
// Settings › Appearance: color mode, background, colors and corners.
import type { Settings } from '@tandem/shared'

const { settings } = useSettings()
const set = useSettingsSave()
const colorMode = useColorMode()
useHead({ title: 'Appearance' })

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
// Previews of the background tones (the real colors are in main.css): light and dark.
const tones: { value: Settings['backgroundTone']; label: string; light: string; dark: string }[] = [
  { value: 'white', label: 'White', light: '#ffffff', dark: 'var(--color-neutral-900)' },
  { value: 'paper', label: 'Paper', light: '#fbf8f1', dark: '#1e1c19' },
  { value: 'sepia', label: 'Sepia', light: '#f5edda', dark: '#221d16' },
  { value: 'cool', label: 'Cool', light: '#f7f9fc', dark: '#161b22' },
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
</script>

<template>
  <div class="space-y-10">
    <p class="text-sm text-muted">Saved with your notes, so it follows the data folder.</p>

    <SettingsSection title="Theme" description="Light, dark, or as the computer is set.">
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
    </SettingsSection>

    <USeparator />

    <SettingsSection
      title="Background"
      description="A tint for the whole window, in light and dark mode."
    >
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          v-for="tone in tones"
          :key="tone.value"
          type="button"
          class="rounded-lg border border-default p-1.5 text-start transition-colors hover:bg-elevated"
          :class="settings.backgroundTone === tone.value && 'border-primary ring-1 ring-primary'"
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
    </SettingsSection>

    <USeparator />

    <SettingsSection title="Accent color" description="Buttons, links, highlights and the logo.">
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
    </SettingsSection>

    <USeparator />

    <SettingsSection
      title="Gray tone"
      description="The grays of the interface: text, borders and backgrounds."
    >
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
    </SettingsSection>

    <USeparator />

    <SettingsSection title="Corner radius" description="How round buttons, fields and cards are.">
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
    </SettingsSection>
  </div>
</template>
