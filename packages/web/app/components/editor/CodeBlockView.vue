<script setup lang="ts">
// Code blocks: syntax highlighting (lowlight decorations), a language picker, a copy button,
// and a live diagram preview for `mermaid` blocks.
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const LANGUAGES = [
  'plaintext',
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'go',
  'graphql',
  'ini',
  'java',
  'javascript',
  'json',
  'kotlin',
  'less',
  'lua',
  'makefile',
  'markdown',
  'mermaid',
  'objectivec',
  'perl',
  'php',
  'python',
  'r',
  'ruby',
  'rust',
  'scss',
  'shell',
  'sql',
  'swift',
  'typescript',
  'vbnet',
  'xml',
  'yaml',
]

const language = computed({
  get: () => (props.node.attrs.language as string | null) ?? 'plaintext',
  set: (value: string) =>
    props.updateAttributes({ language: value === 'plaintext' ? null : value }),
})

const copied = ref(false)
async function copy() {
  await navigator.clipboard.writeText(props.node.textContent)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <NodeViewWrapper class="group/code relative">
    <div
      contenteditable="false"
      class="absolute end-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/code:opacity-100 focus-within:opacity-100"
    >
      <USelectMenu
        v-if="editor.isEditable"
        v-model="language"
        :items="LANGUAGES"
        size="xs"
        variant="soft"
        class="w-32"
        :search-input="{ placeholder: 'Language…' }"
      />
      <UTooltip :text="copied ? 'Copied' : 'Copy'">
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          size="xs"
          color="neutral"
          variant="soft"
          aria-label="Copy code"
          @click="copy"
        />
      </UTooltip>
    </div>
    <pre><NodeViewContent as="code" :class="`hljs language-${language}`" /></pre>
    <MermaidDiagram
      v-if="language === 'mermaid'"
      :code="node.textContent"
      contenteditable="false"
      class="mt-2"
    />
  </NodeViewWrapper>
</template>
