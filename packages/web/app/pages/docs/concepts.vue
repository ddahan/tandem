<script setup lang="ts">
// Docs › Concepts: a tour of everything Tandem does, in the owner's words, grouped, each feature
// in a few sentences. Settings › Specs (utils/specs.ts) lists the same features tersely, with
// what doesn't exist yet; docs/SPEC.md has the full behavior. A feature added goes in both.
import { keysText } from '~/utils/platform-keys'

useHead({ title: 'Concepts' })

interface Concept {
  id: string
  icon: string
  title: string
  text: string
  /** A switch in Settings › Features. */
  optional?: boolean
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
        icon: 'i-lucide-folder-tree',
        title: 'Pages, inside pages',
        text: 'Everything is a page, and any page can hold pages: the sidebar’s tree. Drag pages to reorder or move them, ⌘-click or ⇧-click to select several; each row’s menu (or a right-click) creates, renames and deletes. A page with pages inside but no text shows as a folder.',
      },
      {
        id: 'tabs',
        icon: 'i-lucide-panels-top-left',
        title: 'Tabs',
        text: 'Pages open in tabs, as files in VS Code. A click in the tree previews a page in an italic tab that the next preview replaces; a double click, or an edit, keeps it. ⌘⇧T reopens a closed tab, and your tabs come back when Tandem reopens.',
      },
      {
        id: 'windows',
        icon: 'i-lucide-app-window',
        title: 'A note in its own window',
        text: 'Open in new window (a row’s menu, a tab’s, or the note’s ⋯ menu) shows a note alone, without sidebar or tabs, to put two notes side by side.',
      },
      {
        id: 'search',
        icon: 'i-lucide-search',
        title: 'Search',
        text: 'One search (⌘⇧F) for titles, text, attachment names, bookmarks and the app’s actions. It forgives accents (ete finds été) and typos. Quote a phrase, exclude a word with -word, narrow with tag: or in:.',
      },
      {
        id: 'home',
        icon: 'i-lucide-house',
        title: 'Home',
        text: 'The start page: the search, your tags and the recently updated pages.',
      },
      {
        id: 'icons',
        icon: 'i-lucide-smile',
        title: 'Icons',
        text: 'Every page has an icon, an emoji or an image of yours (click it, left of the title), shown in the tree, the tabs, the breadcrumb and the search.',
      },
      {
        id: 'tags',
        icon: 'i-lucide-tags',
        title: 'Tags',
        text: 'Tags group pages across the tree: click one to search its pages.',
        optional: true,
      },
    ],
  },
  {
    id: 'write',
    title: 'Write',
    description: 'A polished editor that writes plain Markdown, saved as you type.',
    concepts: [
      {
        id: 'markdown',
        icon: 'i-lucide-file-code-2',
        title: 'Plain Markdown, on disk',
        text: 'Each page is a Markdown file in your notes folder, and the tree is its folder tree: Projects.md, and its pages in Projects/. ⌘⇧E shows the Markdown itself. What the editor can’t show (HTML comments, most raw HTML) opens read-only, so it is never lost silently.',
      },
      {
        id: 'editor',
        icon: 'i-lucide-pilcrow',
        title: 'Rich editing',
        text: 'Formatting shows as you type: headings, lists and to-dos at any level, quotes, callouts, collapsible sections, tables, emojis. Type / to insert any block; select text for the toolbar. Drag a block by its handle (⋮⋮), or move it with ⌥↑ ⌥↓. Every block is in the Blocks tab.',
      },
      {
        id: 'code',
        icon: 'i-lucide-code-xml',
        title: 'Code and diagrams',
        text: 'Code blocks are highlighted in the theme of your choice, with a copy button. Mermaid diagrams are drawn in the note, their code shown while you edit them.',
      },
      {
        id: 'keyboard',
        icon: 'i-lucide-keyboard',
        title: 'Keys like your code editor',
        text: 'VS Code’s shortcuts: duplicate, move and delete lines, select every occurrence of a word and type in all at once. ⌘F finds in the note, ⌥⌘F replaces. One undo (⌘Z) for the whole app: text, databases, pages and bookmarks, in the order things were done.',
      },
      {
        id: 'autosave',
        icon: 'i-lucide-cloud-check',
        title: 'Autosave',
        text: 'No save button: a note is saved half a second after you stop typing. When it changes on disk while open (an agent, another app), it reloads live; with unsaved edits, a banner offers to keep yours, take theirs, or compare.',
      },
      {
        id: 'spellcheck',
        icon: 'i-lucide-spell-check',
        title: 'Spell check',
        text: 'Misspelled words are underlined as you type, by the browser’s checker.',
        optional: true,
      },
    ],
  },
  {
    id: 'connect',
    title: 'Link and attach',
    description: 'Notes that point to each other, hold files, tables of data and websites.',
    concepts: [
      {
        id: 'links',
        icon: 'i-lucide-file-symlink',
        title: 'Links between notes',
        text: 'Type [[ to link a note. Links follow the note when it is renamed or moved, and every note lists the notes linking to it. A link to a note that doesn’t exist yet looks muted, and offers to create it.',
      },
      {
        id: 'files',
        icon: 'i-lucide-paperclip',
        title: 'Files',
        text: 'Drop or paste a file anywhere in a note: it is copied into the note’s .assets folder and shown in place, images inline (resizable, full screen on a double click), other files as chips that open them. Removing a file’s last link asks whether to delete the file too.',
      },
      {
        id: 'databases',
        icon: 'i-lucide-sheet',
        title: 'Databases',
        text: 'Type /database for a table with typed columns (text, number, money, date, checkbox, choices), edited like a spreadsheet, sorted and filtered, the view saved for everyone. Its data is kept in Tandem: the note only holds a block naming it.',
      },
      {
        id: 'bookmarks',
        icon: 'i-lucide-bookmark',
        title: 'Bookmarks',
        text: 'Keep websites in your notes, as cards (/bookmark): a theme’s note holds its websites with the rest. Saved from Chrome with Tandem’s extension (Browser Extension tab), they land in Unsorted in the sidebar, to drag into notes. A click opens one as a page, a double click its website.',
        optional: true,
      },
      {
        id: 'side-panel',
        icon: 'i-lucide-panel-right',
        title: 'Side panel',
        text: 'Beside the note: its headings, the notes linking to it, its files, databases and bookmarks, and those of its sub-pages, plus the calendar when daily notes are on.',
      },
    ],
  },
  {
    id: 'plan',
    title: 'Plan',
    description: 'A note for each day, its agenda, and every TODO in one list.',
    concepts: [
      {
        id: 'daily',
        icon: 'i-lucide-calendar-days',
        title: 'Daily notes',
        text: 'Each day can have a note: Today, in the sidebar (⌘T in the installed app), opens today’s; ⌃⌥← ⌃⌥→ go from day to day, ⌃⌥↑ ⌃⌥↓ from week to week. They are Markdown files in the Calendar folder, out of the tree; a day left empty leaves no file.',
        optional: true,
      },
      {
        id: 'calendar',
        icon: 'i-lucide-calendar-check',
        title: 'Calendar and agenda',
        text: 'The side panel’s month shows the days with notes, to-dos left or done, and events. A day’s note starts with its agenda (/event): events typed in one line (14h Standup), repeating or not, checked off when done.',
        optional: true,
      },
      {
        id: 'feeds',
        icon: 'i-lucide-rss',
        title: 'Calendar feeds',
        text: 'Google or iCloud calendars, by their .ics address (Settings › Features, under Daily notes), show read-only in the agenda.',
        optional: true,
      },
      {
        id: 'todos',
        icon: 'i-lucide-list-todo',
        title: 'TODOs',
        text: 'TODO: in capitals anywhere in a note is highlighted, and listed with every other one on the TODOs page, counted in the sidebar; a click opens the note right at it.',
        optional: true,
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
        text: 'Each save records its author: you, an agent by its name, or External edit for a file changed outside Tandem. Each line keeps the author who last changed it, like git blame. The Authorship view shows each block in its author’s color.',
      },
      {
        id: 'history',
        icon: 'i-lucide-history',
        title: 'History',
        text: 'A version is kept at the end of each editing session. Compare any version with the current one and restore it: restoring is a new version, so nothing is lost. All versions are kept for a week, then one a day for three months, then one a week.',
      },
      {
        id: 'trash',
        icon: 'i-lucide-trash-2',
        title: 'Trash',
        text: 'A deleted page waits in the trash with its pages, files and history, and comes back with them. Turned off, deleting asks first, then deletes for good.',
        optional: true,
      },
    ],
  },
  {
    id: 'app',
    title: 'Agents and the app',
    description: 'Your agents write with you, on your machine, in a folder of yours.',
    concepts: [
      {
        id: 'agents',
        icon: 'i-lucide-bot',
        title: 'Agents',
        text: 'Claude and any MCP client read, search, write and organize your notes, databases, bookmarks and agenda; the tandem CLI does the same from a terminal. Their edits are theirs in the history, line by line. How to connect them is in the Agents tab.',
      },
      {
        id: 'folder',
        icon: 'i-lucide-folder-sync',
        title: 'Your notes folder',
        text: 'Notes live in a folder you pick (Settings › General): OneDrive, iCloud Drive, a Git repository. Each folder keeps its own tags, history and authorship, backed up inside it. Edit the files in any app: Tandem notices.',
      },
      {
        id: 'install',
        icon: 'i-lucide-download',
        title: 'An app of its own',
        text: 'Installed with one command, no admin rights, it starts at login and binds to this computer only. Install it from Chrome, Edge or Safari for its own window and Dock icon.',
      },
      {
        id: 'appearance',
        icon: 'i-lucide-palette',
        title: 'Appearance',
        text: 'Light, dark or system; background tone, accent color, corners, fonts, text size, page width and code theme, in Settings › Appearance.',
      },
      {
        id: 'optional',
        icon: 'i-lucide-toggle-right',
        title: 'Only what you use',
        text: 'Features marked Optional are switches in Settings › Features. Off, a feature only hides: its data stays, and agents can still use it.',
      },
    ],
  },
]
</script>

<template>
  <div class="space-y-12">
    <div class="space-y-4">
      <p class="text-sm text-muted">
        Tandem is a notes app for you and your agents: you both write in the same notes, and each
        line remembers who wrote it. Here is everything it does.
      </p>
      <nav aria-label="Concepts" class="flex flex-wrap gap-2">
        <UButton
          v-for="group in GROUPS"
          :key="group.id"
          :to="`#concepts-${group.id}`"
          :label="group.title"
          color="neutral"
          variant="soft"
          size="sm"
        />
      </nav>
    </div>

    <section
      v-for="group in GROUPS"
      :key="group.id"
      :aria-labelledby="`concepts-${group.id}`"
      class="scroll-mt-4"
    >
      <div class="mb-4">
        <h2 :id="`concepts-${group.id}`" class="text-base font-semibold text-highlighted">
          {{ group.title }}
        </h2>
        <p class="text-sm text-muted">{{ group.description }}</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <section
          v-for="concept in group.concepts"
          :key="concept.id"
          :aria-labelledby="`concept-${concept.id}`"
          class="rounded-lg border border-default p-4"
          data-testid="concept"
        >
          <div class="mb-1.5 flex items-center gap-2">
            <UIcon :name="concept.icon" class="size-4 shrink-0 text-primary" />
            <h3 :id="`concept-${concept.id}`" class="text-sm font-semibold text-highlighted">
              {{ concept.title }}
            </h3>
            <UBadge
              v-if="concept.optional"
              label="Optional"
              color="neutral"
              variant="subtle"
              size="sm"
              class="ms-auto"
            />
          </div>
          <p class="text-sm text-default">{{ keysText(concept.text) }}</p>
        </section>
      </div>
    </section>
  </div>
</template>
