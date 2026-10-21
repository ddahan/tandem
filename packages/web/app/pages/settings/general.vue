<script setup lang="ts">
// Settings › General: the workspace's name, yours, and the notes folder.
import { DEFAULT_SETTINGS, type NotesFolder } from '@tandem/shared'

const { settings } = useSettings()
const set = useSettingsSave()
useHead({ title: 'Settings' })

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
</script>

<template>
  <div class="space-y-10">
    <SettingsSection title="Workspace" description="Shown next to the logo and in the browser tab.">
      <UFormField label="Workspace name">
        <UInput v-model="workspaceName" class="w-64" maxlength="40" @change="saveWorkspaceName" />
      </UFormField>
    </SettingsSection>

    <USeparator />

    <SettingsSection title="Notes folder" description="Where your notes are, as Markdown files.">
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
      <NotesFolderPicker v-if="notesFolder" v-model:open="pickerOpen" :current="notesFolder.path" />
    </SettingsSection>

    <USeparator />

    <SettingsSection
      title="You"
      description="Shown in the history and authorship views for what you write."
    >
      <UFormField label="Display name">
        <UInput
          v-model="displayName"
          class="w-64"
          @change="set({ displayName: displayName.trim() || 'Me' })"
        />
      </UFormField>
    </SettingsSection>

    <USeparator />

    <p class="text-sm text-muted">
      To install Tandem as an app or connect an agent, see
      <ULink to="/docs/install" class="text-primary">Docs › Install</ULink> and
      <ULink to="/docs/agents" class="text-primary">Agents</ULink>.
    </p>
  </div>
</template>
