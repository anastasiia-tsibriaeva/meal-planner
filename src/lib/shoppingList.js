/**
 * Генератор списка покупок
 * - Собирает ингредиенты из выбранных дней (только "кулинарные" слоты, не остатки)
 * - Агрегирует одинаковые ингредиенты
 * - Округляет дробные количества вверх для штучных единиц
 * - Фильтрует базовые продукты (соль, перец и пр.)
 */

// Единицы, которые считаются "штучными" — округляем вверх
const PIECE_UNITS = ['шт', 'штук', 'штука', 'штуки', 'шт.', 'штук.', 'pcs', 'piece', 'pieces']

// Единицы, для которых мы сохраняем дробные значения
const VOLUME_UNITS = ['мл', 'л', 'г', 'кг', 'ml', 'l', 'g', 'kg']

/**
 * Нормализует название ингредиента для сравнения
 */
function normalizeIngredientName(name) {
  return name.toLowerCase().trim()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
}

/**
 * Проверяет, является ли ингредиент базовым продуктом
 */
function isPantryItem(ingredientName, pantryItems) {
  const normalized = normalizeIngredientName(ingredientName)
  return pantryItems.some(item => {
    const normalizedItem = normalizeIngredientName(item)
    return normalized === normalizedItem || normalized.includes(normalizedItem)
  })
}

/**
 * Округляет количество в зависимости от единицы измерения
 */
function roundQuantity(quantity, unit) {
  if (!quantity) return null
  const qty = parseFloat(quantity)
  if (isNaN(qty)) return null

  if (unit && PIECE_UNITS.includes(unit.toLowerCase().trim())) {
    return Math.ceil(qty)
  }

  // Для граммов и миллилитров — округляем до целых
  if (unit && (unit === 'г' || unit === 'мл' || unit === 'g' || unit === 'ml')) {
    return Math.round(qty)
  }

  // Для остальных — оставляем как есть, но убираем лишние нули
  const rounded = Math.round(qty * 100) / 100
  return rounded
}

/**
 * Форматирует количество и единицу для отображения
 */
function formatQuantity(quantity, unit) {
  if (quantity === null || quantity === undefined) return unit || ''
  const qty = parseFloat(quantity)
  if (isNaN(qty)) return unit || ''

  let qtyStr
  if (Number.isInteger(qty)) {
    qtyStr = String(qty)
  } else {
    // Обрабатываем дроби типа 0.5 → ½
    if (qty === 0.5) qtyStr = '½'
    else if (qty === 0.25) qtyStr = '¼'
    else if (qty === 0.75) qtyStr = '¾'
    else qtyStr = String(Math.round(qty * 10) / 10)
  }

  return unit ? `${qtyStr} ${unit}` : qtyStr
}

/**
 * Основная функция генерации списка покупок
 * @param {Array} menu - 7-дневное меню
 * @param {number} startDay - начальный день (0-6)
 * @param {number} endDay - конечный день (0-6, включительно)
 * @param {Array} pantryItems - список базовых продуктов
 * @returns {Array} - [{name, displayQty, dishes, checked}]
 */
export function generateShoppingList(menu, startDay, endDay, pantryItems = []) {
  const ingredientMap = new Map() // key: normalized name, value: {name, quantities: [{qty, unit}], dishes: Set}

  for (let day = startDay; day <= endDay && day < menu.length; day++) {
    const dayMenu = menu[day]
    if (!dayMenu) continue

    for (const mealType of ['breakfast', 'lunch', 'dinner']) {
      const slot = dayMenu[mealType]
      if (!slot || !slot.dish) continue
      if (slot.isLeftover) continue // остатки не считаем — ингредиенты уже были куплены

      const dish = slot.dish
      if (!dish.ingredients || dish.ingredients.length === 0) continue

      for (const ingredient of dish.ingredients) {
        if (!ingredient.name?.trim()) continue

        // Пропускаем базовые продукты
        if (isPantryItem(ingredient.name, pantryItems)) continue

        const key = normalizeIngredientName(ingredient.name)

        if (!ingredientMap.has(key)) {
          ingredientMap.set(key, {
            name: ingredient.name,
            quantities: [],
            dishes: new Set(),
          })
        }

        const entry = ingredientMap.get(key)
        entry.dishes.add(dish.name)

        if (ingredient.quantity !== null && ingredient.quantity !== undefined && ingredient.quantity !== '') {
          entry.quantities.push({
            qty: parseFloat(ingredient.quantity) || 0,
            unit: ingredient.unit?.trim() || '',
          })
        }
      }
    }
  }

  // Агрегируем количества
  const result = []
  for (const [, entry] of ingredientMap) {
    let displayQty = ''

    if (entry.quantities.length > 0) {
      // Группируем по единице измерения
      const byUnit = new Map()
      for (const { qty, unit } of entry.quantities) {
        const unitKey = unit.toLowerCase()
        byUnit.set(unitKey, (byUnit.get(unitKey) || 0) + qty)
      }

      // Форматируем каждую группу
      const parts = []
      for (const [unit, totalQty] of byUnit) {
        // Найдём оригинальное написание единицы
        const origUnit = entry.quantities.find(q => q.unit.toLowerCase() === unit)?.unit || unit
        const rounded = roundQuantity(totalQty, origUnit)
        parts.push(formatQuantity(rounded, origUnit))
      }
      displayQty = parts.join(' + ')
    }

    result.push({
      id: crypto.randomUUID(),
      name: entry.name,
      displayQty,
      dishes: Array.from(entry.dishes),
      checked: false,
    })
  }

  // Сортируем по алфавиту
  result.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return result
}
