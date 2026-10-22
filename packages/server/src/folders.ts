// Choosing the notes folder from the app: listing folders for the picker (the server can, a
// browser can't), and checking a candidate. Switching is up to whoever runs the server
// (NotesFolderControl): the standalone app restarts on the new folder; in Docker the folder is
// a mount and can't change from the app.
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { access, constants, mkdir, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { FolderListing } from '@tandem/shared'
import { ValidationError } from './vault/errors.ts'

export interface NotesFolderControl {
  /** Null when the folder can change from the app; otherwise why not (shown in Settings). */
  readOnlyReason: string | null
  /** Switches to `path` (already checked), typically by restarting on it. */
  change(path: string): Promise<void>
}

export const DEFAULT_READ_ONLY_REASON =
  'The notes folder is set where Tandem is started (TANDEM_DATA_DIR, or the folder mounted in Docker).'

/** Why `path` can't be the notes folder, or null. `forbidden`: folders that must not be. */
export async function folderProblem(
  path: string,
  forbidden: string[] = [],
): Promise<string | null> {
  if (!isAbsolute(path)) return 'Use a full path, starting with /.'
  const folder = resolve(path)
  if (folder === '/' || folder === homedir()) {
    return 'Choose a folder inside your home folder, not your whole home folder or disk.'
  }
  if (forbidden.some((other) => folder === other || folder.startsWith(`${other}/`))) {
    return "Tandem's own folder can't hold notes."
  }
  if (folder.split('/').includes('.tandem')) return "That's inside Tandem's internal folder."
  const info = await stat(folder).catch(() => null)
  if (!info) return "This folder doesn't exist."
  if (!info.isDirectory()) return 'This is a file, not a folder.'
  const writable = await access(folder, constants.W_OK).then(
    () => true,
    () => false,
  )
  return writable ? null : "Tandem can't write in this folder."
}

const mobileDocuments = () => join(homedir(), 'Library', 'Mobile Documents')
const iCloudDrive = () => join(mobileDocuments(), 'com~apple~CloudDocs')

/** Apple's apps whose iCloud folder Finder shows in iCloud Drive (others are internal). */
const APPLE_DOCUMENT_APPS: Record<string, string> = {
  'com~apple~Pages': 'Pages',
  'com~apple~Numbers': 'Numbers',
  'com~apple~Keynote': 'Keynote',
  'com~apple~TextEdit': 'TextEdit',
  'com~apple~Preview': 'Preview',
  'com~apple~ScriptEditor2': 'Script Editor',
  'com~apple~QuickTimePlayerX': 'QuickTime Player',
  'com~apple~Automator': 'Automator',
}

/**
 * Apps' iCloud folders, which Finder shows inside iCloud Drive but which live next to it
 * (`Mobile Documents/<container>/Documents`): Apple's document apps, and other apps'
 * (`iCloud~…`, named after their last part), when not empty. Internal ones (backups…) aside.
 */
async function iCloudAppFolders(): Promise<{ name: string; path: string; app: true }[]> {
  const containers = await readdir(mobileDocuments(), { withFileTypes: true }).catch(() => [])
  const found: { name: string; path: string; app: true }[] = []
  for (const container of containers) {
    if (!container.isDirectory()) continue
    const id = container.name
    const name =
      APPLE_DOCUMENT_APPS[id] ??
      (id.startsWith('iCloud~') && !/~(encryptedBackups|debug|staging|shared)$/i.test(id)
        ? id.split('~').at(-1)
        : undefined)
    if (!name) continue
    const documents = join(mobileDocuments(), id, 'Documents')
    const entries = await readdir(documents).catch(() => [])
    if (entries.some((entry) => !entry.startsWith('.'))) {
      found.push({ name, path: documents, app: true })
    }
  }
  return found
}

/** Places to start from in the picker: the usual ones that exist on this computer. */
function places(): { label: string; path: string }[] {
  const home = homedir()
  const list = [
    { label: 'Home', path: home },
    { label: 'Documents', path: join(home, 'Documents') },
    { label: 'iCloud Drive', path: iCloudDrive() },
  ]
  // OneDrive, Google Drive, Dropbox… (macOS File Provider folders).
  const cloud = join(home, 'Library', 'CloudStorage')
  if (existsSync(cloud)) {
    try {
      for (const entry of readdirSync(cloud, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          list.push({ label: entry.name.replace(/-/g, ' '), path: join(cloud, entry.name) })
        }
      }
    } catch {
      // Not readable: no cloud places.
    }
  }
  return list.filter((place) => existsSync(place.path))
}

/**
 * A folder for the picker: its subfolders and what it holds. Hidden folders (`.name`) and
 * ~/Library are left out unless `hidden`, as in Finder (⇧⌘.); `.tandem` always is.
 */
export async function listFolder(
  path: string,
  forbidden: string[] = [],
  options: { hidden?: boolean } = {},
): Promise<FolderListing> {
  const folder = resolve(path || homedir())
  const entries = await readdir(folder, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      throw new ValidationError(
        error.code === 'ENOENT'
          ? "This folder doesn't exist."
          : "Tandem can't read this folder (check macOS's Privacy & Security settings).",
      )
    },
  )
  const folders: FolderListing['folders'] = entries
    .filter((entry) => entry.isDirectory() && entry.name !== '.tandem')
    .filter(
      (entry) =>
        options.hidden ||
        !(entry.name.startsWith('.') || (folder === homedir() && entry.name === 'Library')),
    )
    .map((entry) => ({ name: entry.name, path: join(folder, entry.name) }))
    .toSorted((a, b) => a.name.localeCompare(b.name))
  // iCloud Drive, as Finder shows it: with the apps' folders (after the user's own).
  if (folder === iCloudDrive()) {
    const apps = (await iCloudAppFolders()).toSorted((a, b) => a.name.localeCompare(b.name))
    folders.push(...apps)
  }
  return {
    path: folder,
    parent: folder === '/' ? null : dirname(folder),
    folders,
    tandem: entries.some((entry) => entry.isDirectory() && entry.name === '.tandem'),
    markdownFiles: entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).length,
    problem: await folderProblem(folder, forbidden),
    places: places(),
  }
}

/** Creates `name` in `parent` (the picker's "New folder"). */
export async function createFolder(parent: string, name: string): Promise<string> {
  const clean = name.trim()
  if (!clean || clean !== basename(clean) || clean.startsWith('.')) {
    throw new ValidationError('Invalid folder name.')
  }
  const path = join(resolve(parent), clean)
  if (existsSync(path)) throw new ValidationError('A folder with this name already exists.')
  await mkdir(path)
  return path
}

/**
 * Shows `path` in the computer's file manager, selected where it can be (Finder): a folder
 * the app ships in a hidden place (~/Library) can then be dragged where it's needed. The
 * server runs on the person's computer, so its file manager is theirs.
 */
export function revealFolder(path: string): Promise<void> {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', ['-R', path]]
      : process.platform === 'win32'
        ? ['explorer', [`/select,${path}`]]
        : ['xdg-open', [path]]
  return new Promise((done, fail) => {
    execFile(command, args, (error) => (error ? fail(error) : done()))
  })
}
