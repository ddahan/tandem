// The save status of the note on screen, shared by the note page with the sidebar's footer
// (SaveStatus, next to the version). None when no note is open.
import type { SaveStatus } from '~/composables/useNoteDocument'

export function useOpenNoteSave() {
  return useState<{ status: SaveStatus; savedAt: number | null } | null>(
    'open-note-save',
    () => null,
  )
}
