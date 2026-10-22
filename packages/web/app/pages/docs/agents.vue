<script setup lang="ts">
// Docs › Agents: connecting an agent (MCP at this very address, or the CLI), and what it can
// do. The full guide for agents is docs/agents.md in the repository.
import { copyText } from '~/utils/copy-text'

useHead({ title: 'Agents' })

const toast = useToast()
const mcpUrl = `${window.location.origin}/mcp`
const mcpCommand = `claude mcp add --transport http tandem ${mcpUrl} --header "X-Tandem-Author: claude"`
const cliCommands = `export TANDEM_AUTHOR=claude
tandem search "deployment checklist"
tandem read "Projects/Roadmap"
tandem append "Projects/Roadmap" "- [ ] Draft the release notes"
tandem --help`

async function copy(text: string) {
  if (await copyText(text)) toast.add({ title: 'Copied', icon: 'i-lucide-check' })
  else toast.add({ title: "Couldn't copy: select the text instead", color: 'error' })
}

const abilities = [
  { icon: 'i-lucide-search', text: 'Search, read and list your notes, their tree and tags.' },
  { icon: 'i-lucide-tags', text: 'Set a note’s tags and icon.' },
  {
    icon: 'i-lucide-pencil-line',
    text: 'Create notes, append to them, replace text in them, move and rename them.',
  },
  { icon: 'i-lucide-paperclip', text: 'Attach files, and insert them in a note.' },
  {
    icon: 'i-lucide-sheet',
    text: 'Read and change databases: rows, as your saved view shows them.',
  },
  {
    icon: 'i-lucide-bookmark',
    text: 'Search, add, change and delete bookmarks, and show one’s card in a note.',
  },
  { icon: 'i-lucide-history', text: 'Read a note’s history and its past versions.' },
  { icon: 'i-lucide-calendar-days', text: 'Read and write in a day’s note, today’s by default.' },
]
</script>

<template>
  <div class="space-y-10 text-sm text-muted">
    <p>
      Agents (Claude Code, Claude Desktop, any MCP client) read and write your notes while Tandem
      runs. Everything they write is theirs: each line shows its author, and the history who wrote
      each version.
    </p>

    <section aria-labelledby="agents-mcp" class="space-y-2">
      <h2 id="agents-mcp" class="font-semibold text-highlighted">Connect with MCP</h2>
      <p>The preferred way. For Claude Code, in a terminal:</p>
      <div class="relative">
        <pre
          class="overflow-x-auto rounded-md border border-muted bg-muted p-3 pe-12 text-xs"
          data-testid="mcp-command"
        ><code>{{ mcpCommand }}</code></pre>
        <UButton
          icon="i-lucide-copy"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Copy the command"
          class="absolute end-2 top-2"
          @click="copy(mcpCommand)"
        />
      </div>
      <p>
        Other clients take the same address, <code>{{ mcpUrl }}</code
        >, over HTTP. The <code>X-Tandem-Author</code> header names the agent in the history and the
        authorship view.
      </p>
    </section>

    <section aria-labelledby="agents-cli" class="space-y-2">
      <h2 id="agents-cli" class="font-semibold text-highlighted">Or with the CLI</h2>
      <p>
        <code>tandem</code> is installed with the app (with Docker, it's <code>bin/tandem</code> in
        the repository). <code>TANDEM_AUTHOR</code> names the agent.
      </p>
      <div class="relative">
        <pre
          class="overflow-x-auto rounded-md border border-muted bg-muted p-3 pe-12 text-xs"
        ><code>{{ cliCommands }}</code></pre>
        <UButton
          icon="i-lucide-copy"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Copy the commands"
          class="absolute end-2 top-2"
          @click="copy(cliCommands)"
        />
      </div>
    </section>

    <section aria-labelledby="agents-abilities" class="space-y-3">
      <h2 id="agents-abilities" class="font-semibold text-highlighted">What they can do</h2>
      <ul class="space-y-2">
        <li v-for="ability in abilities" :key="ability.text" class="flex items-start gap-2.5">
          <UIcon :name="ability.icon" class="mt-0.5 size-4 shrink-0 text-primary" />
          <span class="text-default">{{ ability.text }}</span>
        </li>
      </ul>
      <p>
        What they delete goes to the trash, like what you delete, and they can't empty it. Their
        changes show live in the note you have open.
      </p>
    </section>

    <section aria-labelledby="agents-guide" class="space-y-2">
      <h2 id="agents-guide" class="font-semibold text-highlighted">Their guide</h2>
      <p>
        <code>docs/agents.md</code> in the repository tells agents how to use Tandem: the tools, the
        Markdown it understands, the rules (small edits rather than rewrites, so each line keeps its
        author). Point an agent to it, or paste it into its instructions.
      </p>
    </section>
  </div>
</template>
