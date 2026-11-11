/**
 * Вызовы Python-калькулятора (папка api/ в корне проекта).
 * Калькулятор ничего не хранит и не ходит в базу: получает данные, возвращает результат.
 */

async function post(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let body = null
  try { body = await res.json() } catch { /* не JSON — обработаем ниже */ }
  if (!res.ok || !body) {
    throw new Error(`${path}: ${res.status} ${body?.error ?? 'нет ответа'}`)
  }
  return body
}

/** Отправляем только поля, нужные для расчёта. */
function dishForMenu(dish) {
  return {
    id:             dish.id,
    meal_types:     dish.meal_types ?? [],
    meat_type:      dish.meat_type,
    difficulty:     dish.difficulty,
    servings_count: dish.servings_count,
    weekends_only:  dish.weekends_only ?? false,
    ingredients:    (dish.ingredients ?? []).map(i => ({ name: i.name })),
  }
}

/**
 * Меню на неделю.
 * @param {'1-2'|'3-5'|'any'} hardDishesPerWeek — сколько сложных блюд в неделю (от и до)
 * @returns {Promise<Array>} 7 дней: { dayIndex, breakfast, lunch, dinner },
 *   слот — { dishId, isLeftover, servingsUsed } или null
 */
export async function requestMenu(dishes, activeDays, hardDishesPerWeek = '1-2') {
  const body = await post('/api/menu', { dishes: dishes.map(dishForMenu), activeDays, hardDishesPerWeek })
  return body.days
}

/**
 * Список покупок.
 * @param {Array<{dish, servingsUsed}>} cookingSlots — только дни готовки
 * @returns {Promise<Array<{key, name, text}>>}
 */
export async function requestShoppingItems(cookingSlots, pantryItems) {
  const body = await post('/api/shopping', {
    cookingSlots: cookingSlots.map(({ dish, servingsUsed }) => ({
      dish: {
        servings_count: dish.servings_count,
        ingredients: (dish.ingredients ?? []).map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      },
      servingsUsed: servingsUsed ?? null,
    })),
    pantryItems,
  })
  return body.items
}
