// File system helpers for the data folder. Writes are atomic (temporary file, then rename) so
// that OneDrive and the file watcher never see a half-written note.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export function hashContent(content: string | Uint8Array): string {
  return createHash('sha1').update(content).digest('hex')
}

export async function atomicWrite(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tandem-tmp`)
  await writeFile(temporary, content)
  await rename(temporary, path)
}

/** Moves `from` to `to` if `from` exists (creating `to`'s folder). Returns whether it moved. */
export async function moveIfExists(from: string, to: string): Promise<boolean> {
  if (!existsSync(from)) return false
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
  return true
}

/** Removes a folder if it is empty (ignoring `.DS_Store`). */
export async function removeIfEmpty(path: string): Promise<void> {
  try {
    const entries = (await readdir(path)).filter((name) => name !== '.DS_Store')
    if (entries.length === 0) await rm(path, { recursive: true, force: true })
  } catch {
    // Already gone, or not a folder.
  }
}

export interface FileStat {
  mtime: number
  size: number
}

export async function statFile(path: string): Promise<FileStat | null> {
  try {
    const info = await stat(path)
    return { mtime: info.mtimeMs, size: info.size }
  } catch {
    return null
  }
}

/** Names that are never part of the tree: hidden files, Office lock files, our temp files. */
export function isIgnoredName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('~$') || name.endsWith('.tandem-tmp')
}

export interface ScannedPage extends FileStat {
  path: string
}

export interface Scan {
  pages: Map<string, ScannedPage>
  dirs: Set<string>
}

/** Lists pages (`.md` files) and folders under `root`, skipping hidden and `.assets` folders. */
export async function scanTree(root: string): Promise<Scan> {
  const pages = new Map<string, ScannedPage>()
  const dirs = new Set<string>()
  async function walk(relative: string): Promise<void> {
    let entries
    try {
      entries = await readdir(join(root, relative), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (isIgnoredName(entry.name)) continue
      const path = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (entry.name.endsWith('.assets')) continue
        dirs.add(path)
        await walk(path)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const info = await statFile(join(root, path))
        if (info) pages.set(path, { path, ...info })
      }
    }
  }
  await walk('')
  return { pages, dirs }
}

/** Unique name in `dir` among `taken` (lowercase): `Name`, `Name 2`, `Name 3`… */
export function uniqueName(base: string, extension: string, taken: Set<string>): string {
  let candidate = `${base}${extension}`
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${base} ${i}${extension}`
  return candidate
}
