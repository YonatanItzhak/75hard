const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function isDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  return dateKey(parseKey(key)) === key
}

export function addDays(key: string, amount: number): string {
  const date = parseKey(key)
  date.setDate(date.getDate() + amount)
  return dateKey(date)
}

export function weekStart(key: string): string {
  const weekday = parseKey(key).getDay()
  const delta = weekday === 0 ? -6 : 1 - weekday
  return addDays(key, delta)
}

export function formatShort(key: string): string {
  const date = parseKey(key)
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`
}
