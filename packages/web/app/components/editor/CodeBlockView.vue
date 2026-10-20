<script setup lang="ts">
// Code blocks: syntax highlighting (lowlight decorations), a language picker, a copy button.
// `mermaid` blocks are diagrams: read mode shows the diagram only; edit mode shows the code with
// the live diagram below. A toggle switches between them (or double-click the diagram).
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

const isDiagram = computed(() => language.value === 'mermaid')

/** The cursor is in this block (a diagram just inserted from the menu, for instance). */
function cursorInside(): boolean {
  const start = props.getPos()
  if (typeof start !== 'number') return false
  const { from, to } = props.editor.state.selection
  return from >= start && to <= start + props.node.nodeSize
}

// Diagrams open in read mode, unless they are empty or being written (never in a read-only
// editor, whose cursor sits in its first block all the same).
const editing = ref(props.editor.isEditable && (!props.node.textContent.trim() || cursorInside()))

function toggleEditing() {
  editing.value = !editing.value
  if (editing.value) {
    // Put the cursor in the code, ready to type.
    const start = props.getPos()
    if (typeof start === 'number') {
      props.editor
        .chain()
        .focus()
        .setTextSelection(start + props.node.nodeSize - 1)
        .run()
    }
  }
}

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
        v-if="editor.isEditable && (!isDiagram || editing)"
        v-model="language"
        :items="LANGUAGES"
        size="xs"
        variant="soft"
        class="w-32"
        :search-input="{ placeholder: 'Language…' }"
      />
      <UTooltip
        v-if="isDiagram && editor.isEditable"
        :text="editing ? 'Show the diagram only' : 'Edit the diagram'"
      >
        <UButton
          :icon="editing ? 'i-lucide-eye' : 'i-lucide-pencil'"
          :label="editing ? 'Preview' : 'Edit'"
          size="xs"
          color="neutral"
          variant="soft"
          :aria-label="editing ? 'Show the diagram only' : 'Edit the diagram'"
          @click="toggleEditing"
        />
      </UTooltip>
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
    <!-- Hidden, not removed: the code stays the block's editable content. -->
    <pre
      v-show="!isDiagram || editing"
      data-testid="code-block-source"
    ><NodeViewContent as="code" :class="`hljs language-${language}`" /></pre>
    <MermaidDiagram
      v-if="isDiagram"
      :code="node.textContent"
      contenteditable="false"
      :class="editing && 'mt-2'"
      :title="editing ? undefined : 'Double-click to edit'"
      @dblclick="!editing && editor.isEditable && toggleEditing()"
    />
  </NodeViewWrapper>
</template>
