// Copies text for a copy button. The Clipboard API can be refused (a frame, a browser's
// permission setting): then the older `execCommand('copy')`, on a hidden field, which a click
// still allows. Says whether it worked, so the caller can offer another way (select the text).
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.append(field)
    field.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      field.remove()
    }
  }
}
