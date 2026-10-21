<script setup lang="ts">
// Settings › Features: optional parts of the app (types.ts says what "off" keeps).
const { settings } = useSettings()
const set = useSettingsSave()
useHead({ title: 'Features' })

const features: {
  key: 'tags' | 'trash' | 'todos' | 'daily' | 'spellcheck'
  label: string
  description: string
}[] = [
  {
    key: 'tags',
    label: 'Tags',
    description: 'Tag pages, and find them by tag. Off, existing tags are kept, only hidden.',
  },
  {
    key: 'trash',
    label: 'Trash',
    description:
      'Deleted pages wait in the trash, to restore. Off, deleting asks first, then deletes forever.',
  },
  {
    key: 'todos',
    label: 'TODOs',
    description: 'Highlight TODO: lines in notes, and list them on a TODOs page.',
  },
  {
    key: 'daily',
    label: 'Daily notes',
    description:
      'A note for each day, opened from Today in the sidebar (⌘T) or the calendar. Off, they show in the tree, in Calendar.',
  },
  {
    key: 'spellcheck',
    label: 'Spell check',
    description: "Underline misspelled words while typing, with the browser's checker.",
  },
]
</script>

<template>
  <div class="space-y-10" data-testid="features">
    <p class="text-sm text-muted">
      Show only what you use. Turning one off hides it and keeps its data: turn it back on to find
      everything as it was.
    </p>
    <template v-for="(feature, index) in features" :key="feature.key">
      <USeparator v-if="index" />
      <SettingsSection
        :title="feature.label"
        :description="feature.description"
        :for="`feature-${feature.key}`"
      >
        <template #action>
          <USwitch
            :id="`feature-${feature.key}`"
            :model-value="settings[feature.key]"
            @update:model-value="(value) => set({ [feature.key]: value })"
          />
        </template>
      </SettingsSection>
    </template>
  </div>
</template>
