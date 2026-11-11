/**
 * Генератор списка покупок
 * - Берёт только «кулинарные» слоты (остатки не считаем — продукты уже куплены)
 * - Масштабирует количества под реальное число порций (servingsUsed / servings_count)
 * - Суммирует одинаковые ингредиенты из разных блюд (по каждой единице измерения)
 * - Округляет штучные единицы вверх, граммы/мл — до целых
 * - Убирает базовые продукты (соль, перец и пр.)
 */

export const DEFAULT_PANTRY_ITEMS = ['соль', 'чёрный перец', 'перец чёрный', 'перец молотый']

const PIECE_UNITS = ['шт', 'штук', 'штука', 'штуки', 'шт.', 'pcs', 'piece', 'pieces']
const INTEGER_UNITS = ['г', 'гр', 'гр.', 'мл', 'g', 'ml']

export function normalizeIngredientName(name) {
  return (name || '').toLowerCase().trim()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
}

/**
 * Базовый продукт, если все слова из записи кладовой встречаются в названии как
 * отдельные слова: «соль морская» → базовый, «фасоль» → нет.
 */
function isPantryItem(ingredientName, pantryItems) {
  const words = normalizeIngredientName(ingredientName).split(/[\s,()-]+/).filter(Boolean)
  return pantryItems.some(item => {
    const itemWords = normalizeIngredientName(item).split(' ').filter(Boolean)
    return itemWords.length > 0 && itemWords.every(w => words.includes(w))
  })
}

function roundQuantity(qty, unit) {
  const u = (unit || '').toLowerCase().trim()
  if (PIECE_UNITS.includes(u)) return Math.ceil(qty - 1e-9)
  if (INTEGER_UNITS.includes(u)) return Math.round(qty)
  return Math.round(qty * 100) / 100
}

function formatQuantity(qty, unit) {
  let qtyStr
  if (Number.isInteger(qty)) qtyStr = String(qty)
  else if (qty === 0.5) qtyStr = '½'
  else if (qty === 0.25) qtyStr = '¼'
  else if (qty === 0.75) qtyStr = '¾'
  else qtyStr = String(Math.round(qty * 10) / 10)
  return unit ? `${qtyStr} ${unit}` : qtyStr
}

/**
 * @param {Array<{dish: object, servingsUsed?: number}>} cookingSlots — только дни готовки
 * @param {string[]} pantryItems
 * @returns {Array<{key: string, name: string, text: string}>} — отсортировано по алфавиту
 */
export function buildShoppingItems(cookingSlots, pantryItems = DEFAULT_PANTRY_ITEMS) {
  const map = new Map() // key → { name, byUnit: Map(unitKey → {unit, qty}) }

  for (const { dish, servingsUsed } of cookingSlots) {
    if (!dish?.ingredients?.length) continue
    const total = dish.servings_count || 1
    const used = servingsUsed || total
    const scale = used / total

    for (const ing of dish.ingredients) {
      if (!ing.name?.trim()) continue
      if (isPantryItem(ing.name, pantryItems)) continue

      const key = normalizeIngredientName(ing.name)
      if (!map.has(key)) map.set(key, { name: ing.name.trim(), byUnit: new Map() })
      const entry = map.get(key)

      const qty = parseFloat(ing.quantity)
      if (!isNaN(qty) && qty > 0) {
        const unit = (ing.unit || '').trim()
        const unitKey = unit.toLowerCase()
        const prev = entry.byUnit.get(unitKey)
        entry.byUnit.set(unitKey, { unit: prev?.unit ?? unit, qty: (prev?.qty || 0) + qty * scale })
      }
    }
  }

  const result = []
  for (const [key, { name, byUnit }] of map) {
    const parts = [...byUnit.values()].map(({ unit, qty }) => formatQuantity(roundQuantity(qty, unit), unit))
    result.push({ key, name, text: parts.length ? `${name} ${parts.join(' + ')}` : name })
  }
  result.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return result
}
