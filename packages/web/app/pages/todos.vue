<script setup lang="ts">
// Every TODO of the notes (`TODO:` lines), by page: one click opens the note on it.
const todos = useTodos()
const tree = useTree()
useHead({ title: 'TODOs' })

if (!todos.loaded.value) await todos.load()
</script>

<template>
  <UDashboardPanel id="todos">
    <template #header>
      <PageNavbar title="TODOs" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl py-4">
        <p class="mb-6 text-sm text-muted">
          Write <code class="todo-chip">TODO:</code> in a note, in capitals: the rest of the line is
          a TODO, highlighted in the note and listed here. Click one to go to it.
        </p>

        <div v-if="todos.notes.value.length" class="space-y-6">
          <section v-for="note in todos.notes.value" :key="note.id" data-testid="todo-note">
            <NuxtLink
              :to="`/notes/${note.id}`"
              class="mb-2 flex items-center gap-2 font-medium text-highlighted hover:underline"
            >
              <NodeIcon :icon="tree.byId.value.get(note.id)?.icon ?? null" kind="page" />
              <span class="truncate">{{ note.title }}</span>
              <span class="ms-auto shrink-0 text-xs font-normal text-dimmed">
                {{ note.todos.length }}
              </span>
            </NuxtLink>
            <ul class="divide-y divide-default rounded-lg border border-default">
              <li v-for="(todo, index) in note.todos" :key="index">
                <NuxtLink
                  :to="`/notes/${note.id}?todo=${index}`"
                  class="flex items-baseline gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-elevated/60"
                  data-testid="todo-item"
                >
                  <span class="todo-chip shrink-0">TODO</span>
                  <span class="min-w-0 flex-1 text-default">{{ todo.text || '…' }}</span>
                  <span class="shrink-0 text-xs text-dimmed">line {{ todo.line }}</span>
                </NuxtLink>
              </li>
            </ul>
          </section>
        </div>
        <UEmpty
          v-else
          icon="i-lucide-list-todo"
          title="No TODOs"
          description="Write TODO: in a note to add one."
          class="mt-10"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
