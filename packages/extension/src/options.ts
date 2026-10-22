// The extension's options: Tandem's address (the installer's is http://localhost:3864; Tandem
// takes another port when that one is taken), checked as it's saved.
import { getAddress, setAddress } from './settings.ts'
import { createTandem, TandemError } from './tandem.ts'

const input = document.getElementById('address') as HTMLInputElement
const status = document.getElementById('status') as HTMLParagraphElement

async function check(address: string) {
  status.className = 'muted'
  status.textContent = 'Checking…'
  try {
    const enabled = await createTandem(address).enabled()
    status.className = enabled ? 'muted' : 'error'
    status.textContent = enabled
      ? `Tandem answers at ${address}.`
      : `Tandem answers at ${address}, but its bookmarks are off (Settings › Features).`
  } catch (error) {
    status.className = 'error'
    status.textContent =
      error instanceof TandemError ? error.message : `Tandem can’t be reached at ${address}.`
  }
}

document.getElementById('form')!.addEventListener('submit', (event) => {
  event.preventDefault()
  void setAddress(input.value).then((address) => {
    input.value = address
    return check(address)
  })
})

void getAddress().then((address) => {
  input.value = address
  return check(address)
})
