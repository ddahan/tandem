<script setup lang="ts">
// Docs › Security: who could read the notes, and what keeps each one out. Tandem doesn't
// encrypt notes itself (they are plain Markdown, for any app and for agents): the computer and
// the cloud it syncs with do, once turned on.
useHead({ title: 'Security' })

interface Risk {
  id: string
  icon: string
  /** Who could read the notes. */
  title: string
  paragraphs: string[]
  /** What to turn on, and where. */
  steps: string[]
}

const RISKS: Risk[] = [
  {
    id: 'device',
    icon: 'i-lucide-laptop',
    title: 'Someone with your computer or its disk',
    paragraphs: [
      'A lost or stolen computer, or its disk taken out: without encryption, its files can be read from another computer, your password or not.',
    ],
    steps: [
      'Turn on FileVault: System Settings › Privacy & Security › FileVault. It encrypts the whole disk: your notes, their history and Tandem’s database.',
      'Lock your screen when you leave it (⌃⌘Q), and ask for the password at once.',
      'Encrypt your Time Machine disk too: “Encrypt backup” when you choose it.',
    ],
  },
  {
    id: 'cloud',
    icon: 'i-lucide-cloud',
    title: 'The cloud your notes folder syncs with',
    paragraphs: [
      'A notes folder in iCloud Drive, OneDrive or Google Drive is stored on their servers. By default, these services hold the keys to your files: they, or someone getting into your account, can read them.',
    ],
    steps: [
      'iCloud Drive: turn on Advanced Data Protection, System Settings › your name › iCloud › Advanced Data Protection. Your iCloud Drive is then end-to-end encrypted: only your devices can read it, not Apple. Keep your recovery key safe: Apple can’t help you get your data back.',
      'OneDrive, Google Drive, a company drive: none is end-to-end encrypted, and a company’s administrators can read its drive. Keep notes they mustn’t read in a folder that isn’t synced.',
      'Secure your cloud account: a strong password and two-factor authentication.',
    ],
  },
  {
    id: 'apps',
    icon: 'i-lucide-bot',
    title: 'Apps and agents on your computer',
    paragraphs: [
      'Tandem only answers on this computer, without a password: any app you run can reach it, as it can read your documents. Agents connected to Tandem read the notes of the folder in use.',
    ],
    steps: [
      'Connect only agents you trust, and remove those you no longer use (Docs › Agents).',
      'Install apps from sources you trust; macOS asks before an app reads your Documents, Desktop or iCloud Drive: say no when you don’t know why it asks.',
      'Use another computer account for someone else: they can’t read your files.',
    ],
  },
]
</script>

<template>
  <div class="space-y-10 text-sm">
    <p class="text-muted">
      Tandem keeps your notes as plain Markdown files on your computer, and sends them nowhere:
      there is no Tandem account and no Tandem server. Who else can read them depends on your
      computer and on where your notes folder is. Here is what to turn on, for each of them.
    </p>

    <section
      v-for="risk in RISKS"
      :key="risk.id"
      :aria-labelledby="`security-${risk.id}`"
      class="flex items-start gap-3"
      data-testid="security-risk"
    >
      <UIcon :name="risk.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
      <div class="min-w-0 flex-1 space-y-2">
        <h2 :id="`security-${risk.id}`" class="font-semibold text-highlighted">
          {{ risk.title }}
        </h2>
        <p v-for="paragraph in risk.paragraphs" :key="paragraph" class="text-default">
          {{ paragraph }}
        </p>
        <ul class="space-y-1.5 rounded-lg border border-default p-3">
          <li v-for="step in risk.steps" :key="step" class="flex items-start gap-2 text-default">
            <UIcon name="i-lucide-shield-check" class="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{{ step }}</span>
          </li>
        </ul>
      </div>
    </section>

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock-open"
      title="Tandem doesn't encrypt notes itself"
      description="Encrypted notes would be unreadable to other apps, to agents, to the search and to the history: everything Tandem is for. FileVault and Advanced Data Protection encrypt them where they are, without that cost. A secret no app on this computer may read (a password, a key) belongs in the Passwords app, not in a note."
    />

    <section aria-labelledby="security-where" class="space-y-2">
      <h2 id="security-where" class="font-semibold text-highlighted">Where your text is</h2>
      <p class="text-muted">
        In the notes folder (Settings › Notes folder): the notes, their files, and in its hidden
        <code>.tandem</code> folder their history and a backup of Tandem’s database. And in Tandem’s
        own folder, <code>~/Library/Application Support/Tandem</code>: the database, with the search
        index. FileVault covers both; a synced notes folder takes the first to the cloud.
      </p>
    </section>
  </div>
</template>
