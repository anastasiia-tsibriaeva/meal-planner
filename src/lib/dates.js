/**
 * Даты недели. Неделя начинается с понедельника; ключ недели — «YYYY-MM-DD» по местной дате.
 */

export function getCurrentWeekStart() {
  const now  = new Date()
  const day  = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function formatDate(date) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function getWeekLabel(weekStart) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  return `${formatDate(weekStart)} — ${formatDate(weekEnd)}`
}

/**
 * Ключ недели по локальной дате (без перевода в UTC — иначе в часовых поясах
 * восточнее UTC понедельник 00:00 превращается в воскресенье).
 */
export function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
