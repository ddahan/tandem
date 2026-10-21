// Shortcuts written in text (Docs, descriptions): as macOS writes them on a Mac (⌥⌘W), as
// other systems do elsewhere (Ctrl+Alt+W). Key chips (UKbd) already do this by themselves.

export const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

const MODIFIERS: Record<string, string> = { '⌃': 'Ctrl', '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' }
const ORDER = ['Ctrl', 'Alt', 'Shift']
const KEYS: Record<string, string> = {
  '↵': 'Enter',
  '⌫': 'Backspace',
  '←': 'Left',
  '→': 'Right',
  '↑': 'Up',
  '↓': 'Down',
  '⇥': 'Tab',
}

/** Text with its Mac shortcuts (`⌥⌘W`, `⌘-click`, `⌃1…⌃9`) written for this computer. */
export function keysText(text: string, mac = isMac()): string {
  if (mac) return text
  return text.replace(/([⌃⌥⇧⌘]+)(-|[^\s⌃⌥⇧⌘,;:)/…]+)?/g, (_all, symbols: string, key = '') => {
    const names = [...new Set([...symbols].map((symbol) => MODIFIERS[symbol]!))].toSorted(
      (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b),
    )
    // ⌘-click: Ctrl-click.
    if (key === '-') return `${names.join('+')}-`
    const keyName = [...key].map((char) => KEYS[char] ?? char).join('')
    return keyName ? `${names.join('+')}+${keyName}` : names.join('+')
  })
}
