// The extension's settings, in Chrome's storage: Tandem's address (synced with the browser
// profile).
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
