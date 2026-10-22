<script setup lang="ts">
// Docs › Concepts: what Tandem is made of and how it behaves, in the owner's words (the
// product decisions behind it are in docs/SPEC.md).
import { keysText } from '~/utils/platform-keys'

useHead({ title: 'Concepts' })

interface Concept {
  id: string
  icon: string
  title: string
  paragraphs: string[]
}

interface Group {
  id: string
  title: string
  description: string
  concepts: Concept[]
}

const GROUPS: Group[] = [
  {
    id: 'organize',
    title: 'Organize',
    description: 'Pages in a tree, open in tabs, found in one search.',
    concepts: [
      {
        id: 'pages',
        icon: 'i-lucide-file-text',
        title: 'Pages, inside pages',
        paragraphs: [
          'Everything is a page, and any page can have pages inside it: the sidebar’s tree. Drag pages to reorder or move them; each row’s menu (or a right-click) creates, renames and deletes.',
          'A page without content but with pages inside shows as a folder. Writing in it makes it a page again; erasing all of a page that has pages inside makes it a folder.',
        ],
      },
      {
        id: 'tabs',
        icon: 'i-lucide-panels-top-left',
        title: 'Tabs',
        paragraphs: [
          'Pages open in tabs, as files in VS Code. A click in the tree previews a page in a tab in italics, which the next preview replaces and which closes once you leave it; a double click, or editing the page, keeps it open. Settings, Docs, TODOs and the trash open in tabs too.',
          'Drag tabs to reorder them; right-click one to close it, the others or those to its right. Your tabs come back when you reopen Tandem.',
        ],
      },
      {
        id: 'organize',
        icon: 'i-lucide-tags',
        title: 'Icons and tags',
        paragraphs: [
          'Every page has an icon, an emoji or an image of yours (click it, left of the title), shown in the tree, the breadcrumb and the search. Tags, once turned on in Settings › Features, group notes across the tree: click one to search its notes.',
        ],
      },
      {
        id: 'search',
        icon: 'i-lucide-search',
        title: 'Search',
        paragraphs: [
          'One search (⌘⇧F) for titles, text and attachment names, and the app’s actions. It forgives: accents (ete finds été), typos, words being typed. Quote a phrase, exclude a word with -word, filter with tag: or in:.',
        ],
      },
    ],
  },
  {
    id: 'write',
    title: 'Write',
    description: 'Plain Markdown files, saved as you type, with links, files and tables.',
    concepts: [
      {
        id: 'markdown',
        icon: 'i-lucide-file-code-2',
        title: 'Plain Markdown, on disk',
        paragraphs: [
          'Each page is a Markdown file in your notes folder, and the tree is its folder tree: Projects.md, and its pages in Projects/. Any app can read them, and nothing is in them that you or an agent didn’t write.',
          'The editor shows the formatting as you type; ⌘⇧E shows the Markdown itself. What the editor can’t show (HTML comments, most raw HTML) opens read-only, so that it is never lost silently.',
        ],
      },
      {
        id: 'autosave',
        icon: 'i-lucide-cloud-check',
        title: 'Autosave',
        paragraphs: [
          'There is no save button: a note is saved half a second after you stop typing. ⌘S saves at once.',
          'When a note changes on disk while it is open (an agent, another app), it reloads live; if you have unsaved edits, a banner offers to keep yours, take theirs, or compare.',
        ],
      },
      {
        id: 'links',
        icon: 'i-lucide-file-symlink',
        title: 'Links between notes',
        paragraphs: [
          'Type [[ to link a note. Links follow the note when it is renamed or moved, and every note lists the notes that link to it. A link to a note that doesn’t exist yet looks muted, and offers to create it.',
        ],
      },
      {
        id: 'files',
        icon: 'i-lucide-paperclip',
        title: 'Files',
        paragraphs: [
          'Drop or paste a file anywhere in a note: it is copied into the note’s .assets folder, next to its Markdown file, and shown in place: images inline, other files as chips that open them.',
        ],
      },
      {
        id: 'databases',
        icon: 'i-lucide-sheet',
        title: 'Databases',
        paragraphs: [
          'Type /database for a table of rows with typed columns (text, number, date, checkbox, choice), sorted and filtered, with the view saved for everyone. Unlike a Markdown table, its data is kept in Tandem: the note only holds a block naming it.',
        ],
      },
      {
        id: 'bookmarks',
        icon: 'i-lucide-bookmark',
        title: 'Bookmarks',
        paragraphs: [
          'Once turned on in Settings › Features, keep your bookmarks in Tandem: in folders, right after the pages in the sidebar, saved from Chrome with Tandem’s extension (Docs › Browser Extension). A click opens one as a page, edited in place, a double click opens its website; /bookmark shows one as a card in a note, and ⌘⇧F finds them. Like databases, they are kept in Tandem: a note only holds a block naming one.',
        ],
      },
      {
        id: 'daily',
        icon: 'i-lucide-calendar-days',
        title: 'Daily notes',
        paragraphs: [
          'Once turned on in Settings › Features, each day can have a note: Today, in the sidebar (or ⌘T), opens today’s, ⌥⌘← ⌥⌘→ go from day to day and ⌥⌘↑ ⌥⌘↓ from week to week, and the side panel’s calendar any other, with a dot for days with notes, a ring for to-dos left. They are Markdown files in the notes folder’s Calendar folder, out of the tree. A day left empty leaves no file.',
        ],
      },
      {
        id: 'todos',
        icon: 'i-lucide-list-todo',
        title: 'TODOs',
        paragraphs: [
          'Once turned on in Settings › Features, TODO: in capitals anywhere in a note is highlighted, and listed with every other one on the TODOs page, which opens the note right at it.',
        ],
      },
    ],
  },
  {
    id: 'keep',
    title: 'Keep track',
    description: 'Who wrote what, every version, and nothing deleted by mistake.',
    concepts: [
      {
        id: 'authorship',
        icon: 'i-lucide-users',
        title: 'Every line knows who wrote it',
        paragraphs: [
          'Each save records its author: you, an agent by its name, or External edit for a file changed outside Tandem. Each line keeps the author who last changed it, like git blame; moving lines doesn’t change them. The Authorship view shows each block in its author’s color.',
        ],
      },
      {
        id: 'history',
        icon: 'i-lucide-history',
        title: 'History',
        paragraphs: [
          'A version is kept at the end of each editing session (30 seconds without saves, or as soon as someone else writes). Compare any version with the current one, and restore it: restoring is a new version, so nothing is lost.',
          'All versions are kept for a week, then one a day for three months, then one a week.',
        ],
      },
      {
        id: 'trash',
        icon: 'i-lucide-trash-2',
        title: 'Trash',
        paragraphs: [
          'A deleted page goes to the trash with its pages, files and history, and comes back with them. Only you can delete for good. With the trash turned off (Settings › Features), deleting asks first, then deletes for good.',
        ],
      },
    ],
  },
]
</script>

<template>
  <div class="space-y-12">
    <p class="text-sm text-muted">
      Tandem is a notes app for you and your agents: you both write in the same notes, and each line
      remembers who wrote it. How agents connect is in the Agents tab.
    </p>

    <section v-for="group in GROUPS" :key="group.id" :aria-labelledby="`concepts-${group.id}`">
      <div class="mb-5 border-b border-default pb-2">
        <h2 :id="`concepts-${group.id}`" class="text-base font-semibold text-highlighted">
          {{ group.title }}
        </h2>
        <p class="text-sm text-muted">{{ group.description }}</p>
      </div>
      <div class="space-y-6">
        <section
          v-for="concept in group.concepts"
          :key="concept.id"
          :aria-labelledby="`concept-${concept.id}`"
          class="flex items-start gap-3"
          data-testid="concept"
        >
          <UIcon :name="concept.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
          <div class="space-y-1.5 text-sm">
            <h3 :id="`concept-${concept.id}`" class="font-semibold text-highlighted">
              {{ concept.title }}
            </h3>
            <p v-for="paragraph in concept.paragraphs" :key="paragraph" class="text-default">
              {{ keysText(paragraph) }}
            </p>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
