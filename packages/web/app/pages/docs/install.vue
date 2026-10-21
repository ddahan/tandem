<script setup lang="ts">
// Docs › Install: Tandem as an app (its own window and Dock icon), with the browser's install
// prompt or Safari's steps (useInstallApp), where Tandem runs, and the command that updates it
// (app/get.sh).
import { copyText } from '~/utils/copy-text'
import { accentShade, logoSvg } from '~/utils/logo'

useHead({ title: 'Install' })

const install = useInstallApp()
const installLogo = logoSvg(accentShade, 'install-docs-logo')
const address = window.location.origin
const toast = useToast()
const updateCommand =
  'curl -fsSL https://raw.githubusercontent.com/ddahan/tandem/main/app/get.sh | sh'

async function copyUpdateCommand() {
  if (await copyText(updateCommand)) toast.add({ title: 'Copied', icon: 'i-lucide-check' })
  else toast.add({ title: "Couldn't copy: select the command instead", color: 'error' })
}
</script>

<template>
  <div class="space-y-10">
    <section aria-labelledby="install-app">
      <h2 id="install-app" class="font-semibold text-highlighted">The app</h2>
      <p class="mb-4 text-sm text-muted">
        Install Tandem to open it from your Dock, in its own window, like any app. It's the same
        Tandem as in the browser, at the same address.
      </p>
      <div class="flex items-start gap-4" data-testid="install-app">
        <!-- eslint-disable-next-line vue/no-v-html -- our own static drawing -->
        <span
          class="size-12 shrink-0 overflow-hidden rounded-[22%] shadow-sm [&_svg]:size-full"
          v-html="installLogo"
        />
        <p
          v-if="install.installed.value"
          class="flex items-center gap-1.5 pt-3 text-sm text-default"
        >
          <UIcon name="i-lucide-circle-check" class="size-4 text-primary" /> Installed: you're using
          the app.
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
          Your browser isn't offering to install Tandem (it may be installed already). Chrome, Edge,
          Brave and Safari can install it.
        </p>
      </div>
    </section>

    <section aria-labelledby="install-remove" class="space-y-2 text-sm text-muted">
      <h2 id="install-remove" class="font-semibold text-highlighted">Removing the app</h2>
      <p>
        From the app's
        <UIcon name="i-lucide-ellipsis-vertical" class="size-4 align-[-3px]" /> menu (Chrome, Edge,
        Brave): <span class="font-medium text-default">Uninstall Tandem</span>. With Safari, drag
        Tandem from your <span class="font-medium text-default">Applications</span> folder to the
        Trash. Your notes stay: the app is only a window on Tandem.
      </p>
    </section>

    <section aria-labelledby="install-address" class="space-y-2 text-sm text-muted">
      <h2 id="install-address" class="font-semibold text-highlighted">Where Tandem runs</h2>
      <p>
        On this computer only, at <code class="text-highlighted">{{ address }}</code
        >: nobody else can reach it. It keeps running when the window is closed, so agents can work
        in your notes.
      </p>
      <p>Your notes are Markdown files in your notes folder (Settings › Notes folder).</p>
    </section>

    <section aria-labelledby="install-update" class="space-y-2 text-sm text-muted">
      <h2 id="install-update" class="font-semibold text-highlighted">Updating Tandem</h2>
      <p>
        In Terminal, the command that installed it: it downloads the latest version, keeps your
        notes folder and settings, and restarts Tandem. Open windows switch to the new version by
        themselves.
      </p>
      <div class="relative">
        <pre
          class="overflow-x-auto rounded-md border border-muted bg-muted p-3 pe-12 text-xs"
          data-testid="update-command"
        ><code>{{ updateCommand }}</code></pre>
        <UButton
          icon="i-lucide-copy"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Copy the command"
          class="absolute end-2 top-2"
          @click="copyUpdateCommand"
        />
      </div>
      <p>
        Installed from a downloaded copy (no access to GitHub from Terminal)? Run the
        <code>app/install.sh</code> of a newer download instead. To uninstall, add
        <code>-s -- --uninstall</code> after <code>sh</code>: your notes stay.
      </p>
    </section>
  </div>
</template>
