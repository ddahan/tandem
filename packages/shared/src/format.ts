// French formats for dates, times and numbers, whatever the interface language (English).

const LOCALE = 'fr-FR'

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })
const numberFormat = new Intl.NumberFormat(LOCALE)

/** `17/10/2026` */
export function formatDate(ms: number): string {
  return dateFormat.format(ms)
}

/** `17/10/2026 14:32` */
export function formatDateTime(ms: number): string {
  return `${dateFormat.format(ms)} ${timeFormat.format(ms)}`
}

/** `1 234,5` (with the narrow no-break space French uses). */
export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

const euros = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const eurosAndCents = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** `1 234 €`, or `1 234,50 €` with cents (by default when the amount has some). */
export function formatMoney(value: number, cents = !Number.isInteger(value)): string {
  return (cents ? eurosAndCents : euros).format(value)
}

/** `2,4 Mo` */
export function formatSize(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`
}

/** `just now`, `5 min ago`, `3 h ago`, then the date and time. */
export function formatRelative(ms: number, now = Date.now()): string {
  const seconds = Math.round((now - ms) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24 && new Date(ms).getDate() === new Date(now).getDate()) return `${hours} h ago`
  return formatDateTime(ms)
}
