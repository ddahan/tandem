// The extension's settings, in Chrome's storage: Tandem's address (synced with the browser
// profile), and the folder the last bookmark went to (this computer).
import { DEFAULT_ADDRESS, normalizeAddress } from './tandem.ts'

export async function getAddress(): Promise<string> {
  const { address } = (await chrome.storage.sync.get('address')) as { address?: string }
  return normalizeAddress(address ?? DEFAULT_ADDRESS)
}

export async function setAddress(address: string): Promise<string> {
  const normalized = normalizeAddress(address)
  await chrome.storage.sync.set({ address: normalized })
  return normalized
}

/** The folder of the last bookmark made (null: the top). */
export async function getLastFolder(): Promise<string | null> {
  const { lastFolder } = (await chrome.storage.local.get('lastFolder')) as {
    lastFolder?: string | null
  }
  return lastFolder ?? null
}

export async function setLastFolder(id: string | null): Promise<void> {
  await chrome.storage.local.set({ lastFolder: id })
}
