<script setup lang="ts">
// The landing page's one-line install (utils/install-command.ts): the command as typed in a
// terminal, with a copy button, and where to go when a proxy blocks GitHub.
import { copyText } from '~/utils/copy-text'
import { INSTALL_COMMAND, INSTALL_COMMAND_PARTS } from '~/utils/install-command'

const RELEASES = 'https://github.com/ddahan/tandem/releases/latest'

// 'copied', or 'selected' when the browser refused to copy: the command is selected, for ⌘C.
const copyKeys = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘C' : 'Ctrl+C'
const state = ref<'idle' | 'copied' | 'selected'>('idle')
const code = useTemplateRef<HTMLElement>('code')
let reset: ReturnType<typeof setTimeout> | undefined
async function copy() {
  if (await copyText(INSTALL_COMMAND)) state.value = 'copied'
  else {
    const command = code.value?.querySelector('[data-command]')
    if (command) window.getSelection()?.selectAllChildren(command)
    state.value = 'selected'
  }
  clearTimeout(reset)
  reset = setTimeout(() => (state.value = 'idle'), 2500)
}
onBeforeUnmount(() => clearTimeout(reset))
</script>

<template>
  <div class="mx-auto w-full">
    <!-- As wide as the command, up to the page's text: it then wraps between its parts. On narrow
         screens, one line that scrolls sideways (its parts would each be cut). -->
    <div
      class="landing-install mx-auto flex w-fit max-w-full items-center gap-3 rounded-2xl py-2 ps-4 pe-2 text-start"
      data-testid="install-command"
    >
      <UIcon name="i-lucide-terminal" class="size-4 shrink-0 text-zinc-500" />
      <code
        ref="code"
        class="landing-install-code min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-[13px] leading-6 whitespace-nowrap text-zinc-200 md:whitespace-normal"
        ><span data-command
          ><template v-for="(part, index) in INSTALL_COMMAND_PARTS" :key="index"
            >{{ index ? ' ' : ''
            }}<span class="landing-install-part whitespace-nowrap">{{ part }}</span></template
          ></span
        ></code
      >
      <UButton
        :icon="state === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"
        :label="state === 'copied' ? 'Copied' : state === 'selected' ? `Press ${copyKeys}` : 'Copy'"
        size="sm"
        color="neutral"
        variant="ghost"
        class="shrink-0 text-zinc-300 hover:bg-white/10 hover:text-white"
        :class="state === 'copied' && 'text-primary-400 hover:text-primary-400'"
        aria-label="Copy the install command"
        @click="copy"
      />
      <span class="sr-only" aria-live="polite">{{
        state === 'copied'
          ? 'Copied'
          : state === 'selected'
            ? `Selected: press ${copyKeys} to copy`
            : ''
      }}</span>
    </div>
    <p class="mt-3 text-xs text-muted">
      macOS and Linux, no admin rights: paste it in Terminal. GitHub blocked there?
      <ULink
        :to="RELEASES"
        target="_blank"
        class="font-medium text-highlighted underline-offset-2 hover:underline"
        >Download the release</ULink
      >.
    </p>
  </div>
</template>

<style>
/* A terminal line, dark in both modes, with a border of light that drifts slowly. */
.landing-install {
  border: 1px solid transparent;
  background:
    linear-gradient(#09090b, #09090b) padding-box,
    linear-gradient(
        110deg,
        rgb(255 255 255 / 0.08) 20%,
        color-mix(in oklab, var(--ui-color-primary-400) 80%, transparent) 50%,
        rgb(255 255 255 / 0.08) 80%
      )
      border-box;
  background-size:
    100% 100%,
    300% 100%;
  box-shadow: 0 24px 60px -24px color-mix(in oklab, var(--ui-color-primary-500) 55%, transparent);
  animation: landing-install-border 8s linear infinite;
}
@keyframes landing-install-border {
  from {
    background-position:
      0 0,
      100% 0;
  }
  to {
    background-position:
      0 0,
      -200% 0;
  }
}
/* Lines after the first start under the command, not under the prompt. */
.landing-install-code {
  scrollbar-width: none;
  padding-inline-start: 2ch;
  text-indent: -2ch;
}
/* Narrower than the command: its end fades out, to show it scrolls. */
@media (max-width: 47.99rem) {
  .landing-install-code {
    mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
  }
}
/* The prompt and the caret: drawn, never copied or selected with the command, and on the same
   line as their part. */
.landing-install-part:first-child::before {
  content: '$ ';
  color: var(--ui-color-primary-400);
}
.landing-install-part:last-child::after {
  content: '';
  display: inline-block;
  width: 0.55em;
  height: 1.1em;
  margin-inline-start: 0.2em;
  vertical-align: -0.2em;
  background: var(--ui-color-primary-400);
  animation: landing-caret 1.1s steps(1) infinite;
  text-indent: 0;
}
@keyframes landing-caret {
  50% {
    opacity: 0;
  }
}
</style>
