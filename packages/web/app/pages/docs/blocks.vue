<script setup lang="ts">
// Docs › Blocks: every block the editor writes (utils/docs-blocks.ts), shown by the editor
// itself next to its Markdown, with how to add it.
import { DOCS_BLOCK_GROUPS } from '~/utils/docs-blocks'
import { keysText } from '~/utils/platform-keys'

useHead({ title: 'Blocks' })

/** The database drawn in its block's example: a header, then rows. */
const DATABASE_ROWS: [string, string, string | boolean][] = [
  ['Team', 'Plan', 'Paid'],
  ['Design', 'Pro', true],
  ['Sales', 'Team', false],
]

/** `code` in a description, as code. */
function parts(text: string) {
  return keysText(text)
    .split('`')
    .map((part, index) => ({ text: part, code: index % 2 === 1 }))
}
</script>

<template>
  <div class="space-y-10">
    <p class="text-sm text-muted">
      Everything a note can hold, as the editor shows it and as it is saved. Type
      <code class="rounded border border-muted bg-muted px-1 font-mono text-xs text-highlighted"
        >/</code
      >
      in a note for the block menu, or type the Markdown: it turns into formatting.
    </p>

    <nav aria-label="Blocks" class="flex flex-wrap gap-1.5">
      <template v-for="group in DOCS_BLOCK_GROUPS" :key="group.id">
        <UButton
          v-for="block in group.blocks"
          :key="block.id"
          :to="`#block-${block.id}`"
          :label="block.title"
          :icon="block.icon"
          size="xs"
          color="neutral"
          variant="subtle"
        />
      </template>
    </nav>

    <section
      v-for="group in DOCS_BLOCK_GROUPS"
      :key="group.id"
      :aria-labelledby="`blocks-${group.id}`"
      class="space-y-6"
    >
      <h2
        :id="`blocks-${group.id}`"
        class="text-xs font-semibold tracking-wide text-dimmed uppercase"
      >
        {{ group.title }}
      </h2>

      <article
        v-for="block in group.blocks"
        :id="`block-${block.id}`"
        :key="block.id"
        class="scroll-mt-4 overflow-hidden rounded-lg border border-default"
        data-testid="docs-block"
      >
        <header class="flex flex-wrap items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div class="flex min-w-0 items-start gap-2.5">
            <UIcon :name="block.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div class="min-w-0">
              <h3 class="font-semibold text-highlighted">{{ block.title }}</h3>
              <p class="text-sm text-muted">
                <template v-for="(part, index) in parts(block.description)" :key="index">
                  <code v-if="part.code" class="font-mono text-xs text-highlighted">{{
                    part.text
                  }}</code>
                  <template v-else>{{ part.text }}</template>
                </template>
              </p>
            </div>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <UBadge
              v-if="block.slash"
              :label="`/ ${block.slash}`"
              color="neutral"
              variant="soft"
              size="sm"
            />
            <DocsKeys :typed="block.typed" :keys="block.keys" />
          </div>
        </header>

        <div class="grid border-t border-default md:grid-cols-2">
          <div class="min-w-0 p-4" data-testid="docs-block-preview">
            <DocsExample
              v-if="block.preview !== null"
              :markdown="block.preview ?? block.markdown"
            />
            <!-- A bookmark is in Tandem, not in the Markdown: a drawing of its card. -->
            <div
              v-else-if="block.id === 'bookmark'"
              class="flex items-center gap-3 rounded-md border border-default px-3 py-2.5"
            >
              <UIcon name="i-lucide-globe" class="size-8 shrink-0 text-dimmed" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-highlighted">MDN Web Docs</p>
                <p class="truncate text-xs text-muted">developer.mozilla.org</p>
                <p class="mt-0.5 line-clamp-2 text-sm">Resources for developers, by developers.</p>
              </div>
            </div>
            <!-- A database's rows are in Tandem, not in the Markdown: a drawing of one. -->
            <div v-else class="overflow-hidden rounded-md border border-default text-sm">
              <div
                v-for="(row, index) in DATABASE_ROWS"
                :key="index"
                class="grid grid-cols-[1fr_5rem_2rem] items-center gap-2 border-default px-3 py-1.5"
                :class="index === 0 ? 'bg-elevated text-xs font-medium text-muted' : 'border-t'"
              >
                <span class="truncate">{{ row[0] }}</span>
                <span>
                  <UBadge
                    v-if="index > 0"
                    :label="row[1]"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  />
                  <template v-else>{{ row[1] }}</template>
                </span>
                <UIcon
                  v-if="index > 0"
                  :name="row[2] ? 'i-lucide-square-check' : 'i-lucide-square'"
                  class="size-4 text-primary"
                />
                <span v-else>{{ row[2] }}</span>
              </div>
            </div>
          </div>
          <pre
            class="min-w-0 overflow-x-auto border-t border-default bg-muted p-4 font-mono text-xs leading-5 whitespace-pre-wrap text-default [font-variant-ligatures:none] md:border-s md:border-t-0"
            aria-label="Markdown"
          ><code>{{ block.markdown }}</code></pre>
        </div>
      </article>
    </section>
  </div>
</template>
