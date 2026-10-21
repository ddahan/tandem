<script setup lang="ts">
// Settings › Editor: how notes read: font, text size, width, code blocks.
import type { Settings } from '@tandem/shared'
import { EDITOR_FONT_SIZES } from '~/composables/useSettings'

const { settings } = useSettings()
const set = useSettingsSave()
useHead({ title: 'Editor' })

const fonts: { value: Settings['editorFont']; label: string; family: string }[] = [
  { value: 'sans', label: 'Inter', family: 'var(--font-sans)' },
  { value: 'serif', label: 'Literata', family: 'var(--font-serif)' },
  { value: 'mono', label: 'JetBrains Mono', family: 'var(--font-mono)' },
  { value: 'system', label: 'System', family: 'ui-sans-serif, -apple-system, sans-serif' },
]
const sizes: { value: Settings['editorFontSize']; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra large' },
]
const widths: { value: Settings['editorWidth']; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
  { value: 'full', label: 'Full' },
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
</script>

<template>
  <div class="space-y-10">
    <SettingsSection title="Font" description="The font of notes.">
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
    </SettingsSection>

    <USeparator />

    <SettingsSection title="Text size" description="In notes only; the interface keeps its size.">
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
    </SettingsSection>

    <USeparator />

    <SettingsSection
      title="Page width"
      description="How wide notes are; a note’s ⋯ menu makes one full width."
    >
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
    </SettingsSection>

    <USeparator />

    <SettingsSection
      title="Code blocks"
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
          <span class="flex overflow-hidden rounded-md border border-default" aria-hidden="true">
            <span
              v-for="mode in ['light', 'dark']"
              :key="mode"
              :data-code-preview="`${theme.value}-${mode}`"
              class="block min-w-0 flex-1 overflow-hidden px-1.5 py-1 font-mono text-[10px] leading-relaxed whitespace-nowrap"
              :style="{ background: 'var(--code-bg)', color: 'var(--code-fg)' }"
            >
              <span class="block italic" :style="{ color: 'var(--code-comment)' }">// Hi</span>
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
          <span class="mt-1.5 block truncate px-0.5 text-xs text-muted">{{ theme.label }}</span>
        </button>
      </div>
    </SettingsSection>
  </div>
</template>
