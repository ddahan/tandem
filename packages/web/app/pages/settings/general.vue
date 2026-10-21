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
    <section>
      <h2 class="font-semibold text-highlighted">Workspace</h2>
      <p class="mb-4 text-sm text-muted">Shown next to the logo and in the browser tab.</p>
      <UFormField label="Workspace name">
        <UInput v-model="workspaceName" class="w-64" maxlength="40" @change="saveWorkspaceName" />
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
      <NotesFolderPicker v-if="notesFolder" v-model:open="pickerOpen" :current="notesFolder.path" />
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

    <p class="text-sm text-muted">
      To install Tandem as an app or connect an agent, see
      <ULink to="/docs/install" class="text-primary">Docs › Install</ULink> and
      <ULink to="/docs/agents" class="text-primary">Agents</ULink>.
    </p>
  </div>
</template>
