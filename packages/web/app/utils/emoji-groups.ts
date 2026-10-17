// Emojis for the icon picker, by category (GitHub's list, which the editor's emoji menu uses too).
import { gitHubEmojis } from '@tiptap/extension-emoji'

export interface PickerEmoji {
  emoji: string
  name: string
  /** Lowercase words to search: name, shortcodes and tags. */
  keywords: string
}

export interface EmojiGroup {
  id: string
  label: string
  emojis: PickerEmoji[]
}

// The list's own group names, in order; smileys have no group name in it.
const GROUPS: [string, string][] = [
  ['', 'Smileys'],
  ['people & body', 'People'],
  ['animals & nature', 'Nature'],
  ['food & drink', 'Food'],
  ['activities', 'Activities'],
  ['travel & places', 'Travel'],
  ['objects', 'Objects'],
  ['symbols', 'Symbols'],
  ['flags', 'Flags'],
]

let groups: EmojiGroup[] | null = null

export function emojiGroups(): EmojiGroup[] {
  groups ??= GROUPS.map(([id, label]) => ({
    id: id || 'smileys',
    label,
    emojis: gitHubEmojis
      .filter((e) => e.emoji && e.group === id && !e.name.startsWith('regional_indicator'))
      .map((e) => ({
        emoji: e.emoji!,
        name: e.name.replace(/_/g, ' '),
        keywords: [e.name, ...e.shortcodes, ...e.tags].join(' ').toLowerCase(),
      })),
  }))
  return groups
}

/** Emojis whose name, shortcodes or tags contain every word of the query. */
export function searchEmojis(query: string, limit = 96): PickerEmoji[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const results: PickerEmoji[] = []
  for (const group of emojiGroups()) {
    for (const emoji of group.emojis) {
      if (words.every((word) => emoji.keywords.includes(word))) results.push(emoji)
      if (results.length >= limit) return results
    }
  }
  return results
}
