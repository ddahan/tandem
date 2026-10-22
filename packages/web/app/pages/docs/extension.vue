<script setup lang="ts">
// Docs › Extension: setting up Tandem's Chrome extension (loaded unpacked from the installed
// app's folder, which the server says: /api/extension), and what it does once there.
import { copyText } from '~/utils/copy-text'

useHead({ title: 'Extension' })

const api = useApi()
const toast = useToast()
const { settings } = useSettings()
const set = useSettingsSave()
const address = window.location.origin
const folder = ref<string | null>(null)
onMounted(async () => {
  folder.value = (await unwrap(api.extension.$get()).catch(() => ({ folder: null }))).folder
})

async function copy(text: string) {
  if (await copyText(text)) toast.add({ title: 'Copied', icon: 'i-lucide-check' })
  else toast.add({ title: "Couldn't copy: select it instead", color: 'error' })
}

const code = 'rounded border border-muted bg-muted px-1 font-mono text-xs text-highlighted'
</script>

<template>
  <div class="space-y-10 text-sm" data-testid="docs-extension">
    <p class="text-muted">
      Tandem’s Chrome extension adds the page you’re reading to your bookmarks in Tandem, with its
      name, address, description and icon, and finds your bookmarks from Chrome’s address bar. It
      talks to the Tandem on this computer only.
    </p>

    <section aria-labelledby="extension-setup" class="space-y-4">
      <h2 id="extension-setup" class="font-semibold text-highlighted">Set it up</h2>
      <ol class="list-decimal space-y-4 ps-5">
        <li>
          <p>Turn bookmarks on in Settings › Features.</p>
          <div class="mt-2 flex items-center gap-2">
            <USwitch
              :model-value="settings.bookmarks"
              label="Bookmarks"
              @update:model-value="(value) => set({ bookmarks: value })"
            />
          </div>
        </li>
        <li>
          In Chrome, open <code :class="code">chrome://extensions</code> and turn on
          <strong>Developer mode</strong> (top right).
          <UButton
            label="Copy"
            icon="i-lucide-copy"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="copy('chrome://extensions')"
          />
        </li>
        <li>
          <p>Click <strong>Load unpacked</strong> and choose Tandem’s extension folder:</p>
          <div
            v-if="folder"
            class="mt-2 flex items-center gap-2 rounded-md border border-default bg-muted px-3 py-2"
          >
            <code
              class="min-w-0 flex-1 font-mono text-xs break-all"
              data-testid="extension-folder"
              >{{ folder }}</code
            >
            <UButton
              icon="i-lucide-copy"
              size="xs"
              color="neutral"
              variant="ghost"
              aria-label="Copy the folder"
              @click="copy(folder)"
            />
          </div>
          <p v-if="folder" class="mt-2 text-muted">
            In the folder dialog, <UKbd value="meta" /><UKbd value="shift" /><UKbd value="g" />
            opens a field: paste the folder there.
          </p>
          <p v-else class="mt-2 text-muted">
            It comes with the installed app, in its folder:
            <code :class="code">~/Library/Application Support/Tandem/app/extension</code> on macOS,
            <code :class="code">~/.local/share/tandem/app/extension</code> on Linux. From a clone of
            the repository, build it with
            <code :class="code">./td pnpm --filter @tandem/extension build</code> and choose
            <code :class="code">packages/extension/dist</code>.
          </p>
        </li>
        <li>Pin it: the puzzle piece next to the address bar, then the pin next to Tandem.</li>
        <li>
          Tandem isn’t at <code :class="code">http://localhost:3864</code>? Here, it is at
          <code :class="code">{{ address }}</code
          >: set it in the extension’s options (right-click its button › Options).
        </li>
      </ol>
      <p class="text-muted">
        Updating Tandem updates the extension too: Chrome reads it again when it restarts (or click
        its reload arrow in <code :class="code">chrome://extensions</code>).
      </p>
    </section>

    <section aria-labelledby="extension-use" class="space-y-3">
      <h2 id="extension-use" class="font-semibold text-highlighted">Use it</h2>
      <ul class="list-disc space-y-2 ps-5">
        <li>
          <strong>Add a page</strong>: click Tandem’s button (or <UKbd value="alt" /><UKbd
            value="shift"
          /><UKbd value="d" />, changed in
          <code :class="code">chrome://extensions/shortcuts</code>). Its name, address and
          description are filled in from the page; pick a folder (the last one used is chosen) and
          Create.
        </li>
        <li>
          <strong>Already saved</strong>: the button shows ✓, and opens the bookmark to change it.
        </li>
        <li>
          <strong>Find a bookmark</strong>: in the address bar, type <code :class="code">tb</code>,
          then <UKbd value="tab" /> and words from its name, address or description.
        </li>
        <li>Tandem not running, or bookmarks off: the extension says so, and how to fix it.</li>
      </ul>
      <p class="text-muted">Chrome only for now: there is no Safari extension yet.</p>
    </section>
  </div>
</template>
