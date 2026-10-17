<script setup lang="ts">
// The landing page's agents card: the CLI and an MCP tool call, typed in turn (real commands
// and tool names: packages/cli, packages/server/src/api/mcp.ts).
type Kind = 'command' | 'output' | 'dim' | 'success' | 'json'
interface Row {
  kind: Kind
  text: string
}

const SCENES: { id: 'cli' | 'mcp'; label: string; rows: Row[] }[] = [
  {
    id: 'cli',
    label: 'CLI',
    rows: [
      { kind: 'command', text: 'tandem search "launch plan"' },
      { kind: 'output', text: 'Projects/Launch plan  (k3Jd9xQe2TmA)' },
      { kind: 'dim', text: '  Ship the beta to ten friendly teams by the end…' },
      { kind: 'dim', text: '  tags: work, launch' },
      {
        kind: 'command',
        text: 'tandem append "Launch plan" "- [ ] Book the venue" --author claude',
      },
      { kind: 'success', text: 'Appended to Projects/Launch plan.md' },
    ],
  },
  {
    id: 'mcp',
    label: 'MCP',
    rows: [
      { kind: 'dim', text: '→ tools/call  append_to_note' },
      { kind: 'json', text: '{ "note": "Launch plan",' },
      { kind: 'json', text: '  "content": "- [ ] Book the venue" }' },
      { kind: 'dim', text: '← result' },
      { kind: 'success', text: 'Appended to Projects/Launch plan.md' },
      { kind: 'dim', text: '# saved as claude: in the history and line by line' },
    ],
  },
]

const scene = ref(0)
const rows = ref<Row[]>([])

const { reduced } = useDemoLoop(async (wait) => {
  for (const [index, current] of SCENES.entries()) {
    scene.value = index
    rows.value = []
    await wait(500)
    for (const row of current.rows) {
      if (row.kind === 'command') {
        rows.value.push({ kind: 'command', text: '' })
        const last = rows.value[rows.value.length - 1]!
        for (const char of row.text) {
          last.text += char
          await wait(22 + Math.random() * 30)
        }
        await wait(380)
      } else {
        rows.value.push({ ...row })
        await wait(row.kind === 'json' ? 160 : 260)
      }
    }
    await wait(3200)
  }
})

watch(
  reduced,
  (value) => {
    // Shown as is: nothing changes them without the loop.
    if (value) rows.value = [...SCENES[0]!.rows]
  },
  { immediate: true },
)

const COLORS: Record<Kind, string> = {
  command: 'text-white',
  output: 'text-zinc-200',
  dim: 'text-zinc-500',
  success: 'text-emerald-400',
  json: 'text-amber-200',
}
</script>

<template>
  <div
    class="landing-terminal overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 font-mono text-[12.5px] leading-6 shadow-2xl"
    aria-hidden="true"
  >
    <div class="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
      <div class="flex gap-1.5">
        <span class="size-3 rounded-full bg-white/15" />
        <span class="size-3 rounded-full bg-white/15" />
        <span class="size-3 rounded-full bg-white/15" />
      </div>
      <div class="flex gap-1 rounded-lg bg-white/5 p-0.5 font-sans text-xs">
        <span
          v-for="(item, index) in SCENES"
          :key="item.id"
          class="rounded-md px-2.5 py-0.5 transition-colors duration-300"
          :class="index === scene ? 'bg-white/15 text-white' : 'text-zinc-500'"
          >{{ item.label }}</span
        >
      </div>
      <span class="ms-auto flex items-center gap-1.5 font-sans text-[11px] text-zinc-400">
        <span class="relative flex size-2">
          <span
            class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70"
          />
          <span class="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        claude connected
      </span>
    </div>
    <div class="h-64 overflow-hidden px-4 py-3">
      <div
        v-for="(row, index) in rows"
        :key="index"
        class="landing-row break-all whitespace-pre-wrap"
      >
        <template v-if="row.kind === 'command'">
          <span class="text-(--ui-color-primary-400)">❯ </span
          ><span :class="COLORS.command">{{ row.text }}</span>
          <span
            v-if="index === rows.length - 1"
            class="ms-0.5 inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-zinc-300"
          />
        </template>
        <span v-else :class="COLORS[row.kind]">{{ row.text }}</span>
      </div>
    </div>
  </div>
</template>
