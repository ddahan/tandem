<script setup lang="ts">
// Docs › Concepts: what Tandem is made of and how it behaves, in the owner's words (the
// product decisions behind it are in docs/SPEC.md).
useHead({ title: 'Concepts' })

interface Concept {
  id: string
  icon: string
  title: string
  paragraphs: string[]
  /** Where it is in the app. */
  where?: string
}

const CONCEPTS: Concept[] = [
  {
    id: 'pages',
    icon: 'i-lucide-file-text',
    title: 'Pages, inside pages',
    paragraphs: [
      'Everything is a page, and any page can have pages inside it: the sidebar’s tree. Drag pages to reorder or move them; each row’s menu (or a right-click) creates, renames and deletes.',
      'A page without content but with pages inside shows as a folder. Writing in it makes it a page again; erasing all of a page that has pages inside makes it a folder.',
    ],
    where: 'The sidebar’s tree, and + above it.',
  },
  {
    id: 'tabs',
    icon: 'i-lucide-panels-top-left',
    title: 'Tabs',
    paragraphs: [
      'Pages open in tabs, as files in VS Code. A click in the tree previews a page in a tab in italics, which the next preview replaces; a double click, or editing the page, keeps it open. Settings, Docs, TODOs and the trash open in tabs too.',
      'Drag tabs to reorder them; right-click one to close it, the others or those to its right. Your tabs come back when you reopen Tandem.',
    ],
    where: 'Above the page. ⌥⌘W closes one, ⌃1…⌃9 go to one.',
  },
  {
    id: 'markdown',
    icon: 'i-lucide-file-code-2',
    title: 'Plain Markdown, on disk',
    paragraphs: [
      'Each page is a Markdown file in your notes folder, and the tree is its folder tree: Projects.md, and its pages in Projects/. Any app can read them, and nothing is in them that you or an agent didn’t write.',
      'The editor shows the formatting as you type; ⌘⇧E shows the Markdown itself. What the editor can’t show (HTML comments, most raw HTML) opens read-only, so that it is never lost silently.',
    ],
    where: 'Settings › Notes folder. Blocks lists what the editor writes.',
  },
  {
    id: 'autosave',
    icon: 'i-lucide-cloud-check',
    title: 'Autosave',
    paragraphs: [
      'There is no save button: a note is saved half a second after you stop typing (Saving… then Saved, at the top). ⌘S saves at once.',
      'When a note changes on disk while it is open (an agent, another app), it reloads live; if you have unsaved edits, a banner offers to keep yours, take theirs, or compare.',
    ],
  },
  {
    id: 'authorship',
    icon: 'i-lucide-users',
    title: 'Every line knows who wrote it',
    paragraphs: [
      'Each save records its author: you, an agent by its name, or External edit for a file changed outside Tandem. Each line keeps the author who last changed it, like git blame; moving lines doesn’t change them.',
    ],
    where: 'The Authorship view, at the top of a note: each block in its author’s color.',
  },
  {
    id: 'history',
    icon: 'i-lucide-history',
    title: 'History',
    paragraphs: [
      'A version is kept at the end of each editing session (30 seconds without saves, or as soon as someone else writes). Compare any version with the current one, and restore it: restoring is a new version, so nothing is lost.',
      'All versions are kept for a week, then one a day for three months, then one a week.',
    ],
    where: 'The side panel’s History tab (⌘\\).',
  },
  {
    id: 'links',
    icon: 'i-lucide-file-symlink',
    title: 'Links between notes',
    paragraphs: [
      'Type [[ to link a note. Links follow the note when it is renamed or moved, and every note lists the notes that link to it. A link to a note that doesn’t exist yet looks muted, and offers to create it.',
    ],
    where: 'The side panel’s Links tab.',
  },
  {
    id: 'files',
    icon: 'i-lucide-paperclip',
    title: 'Files',
    paragraphs: [
      'Drop or paste a file anywhere in a note: it is copied into the note’s .assets folder, next to its Markdown file, and shown in place: images inline, other files as chips that open them.',
    ],
    where: 'The side panel’s Files tab lists a note’s files.',
  },
  {
    id: 'databases',
    icon: 'i-lucide-sheet',
    title: 'Databases',
    paragraphs: [
      'A table of rows with typed columns (text, number, date, checkbox, choice), sorted and filtered, with the view saved for everyone. Unlike a Markdown table, its data is kept in Tandem: the note only holds a block naming it.',
    ],
    where: 'Type /database in a note.',
  },
  {
    id: 'organize',
    icon: 'i-lucide-tags',
    title: 'Tags and icons',
    paragraphs: [
      'Tags group notes across the tree: click one to search its notes. Every page has an icon, an emoji or an image of yours, shown in the tree, the breadcrumb and the search.',
    ],
    where: 'Under a note’s title, and its icon left of it.',
  },
  {
    id: 'search',
    icon: 'i-lucide-search',
    title: 'Search',
    paragraphs: [
      'One search for titles, text and attachment names, and the app’s actions. It forgives: accents (ete finds été), typos, words being typed. Quote a phrase, exclude a word with -word, filter with tag: or in:.',
    ],
    where: '⌘⇧F, or the sidebar’s search button.',
  },
  {
    id: 'todos',
    icon: 'i-lucide-list-todo',
    title: 'TODOs',
    paragraphs: [
      'Write TODO: in capitals anywhere in a note: it is highlighted, and listed with every other one on the TODOs page, which opens the note right at it.',
    ],
    where: 'TODOs, in the sidebar.',
  },
  {
    id: 'trash',
    icon: 'i-lucide-trash-2',
    title: 'Trash',
    paragraphs: [
      'A deleted page goes to the trash with its pages, files and history, and comes back with them. Only you can delete for good.',
    ],
    where: 'Trash, in the sidebar.',
  },
  {
    id: 'agents',
    icon: 'i-lucide-bot',
    title: 'Agents',
    paragraphs: [
      'Agents read and write your notes through Tandem’s MCP server or its CLI, while you work: their changes appear live, under their name. The Agents tab says how to connect one.',
    ],
  },
]
</script>

<template>
  <div class="space-y-8">
    <p class="text-sm text-muted">
      Tandem is a notes app for you and your agents: you both write in the same notes, and each line
      remembers who wrote it.
    </p>

    <section
      v-for="concept in CONCEPTS"
      :key="concept.id"
      :aria-labelledby="`concept-${concept.id}`"
      class="flex items-start gap-3"
      data-testid="concept"
    >
      <UIcon :name="concept.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
      <div class="space-y-1.5 text-sm">
        <h2 :id="`concept-${concept.id}`" class="font-semibold text-highlighted">
          {{ concept.title }}
        </h2>
        <p v-for="paragraph in concept.paragraphs" :key="paragraph" class="text-default">
          {{ paragraph }}
        </p>
        <p v-if="concept.where" class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon name="i-lucide-map-pin" class="size-3.5 shrink-0" /> {{ concept.where }}
        </p>
      </div>
    </section>
  </div>
</template>
