/**
 * Генератор меню на неделю
 * Правила:
 * - Завтраки: одно и то же блюдо 2 дня подряд
 * - Сложность: не более 1 сложного блюда за всю неделю (без ограничений по дням)
 * - weekends_only: блюдо может стартовать только в выходной день (остатки идут на будни)
 * - Разнообразие мяса: стараемся охватить хотя бы 3 из 4 типов (птица, рыба, морепродукты, красное мясо)
 * - Batch cooking: блюдо с servings_count>1 покрывает несколько слотов
 * - Переходящие остатки: если в конце предыдущей недели остались порции — они стартуют новую неделю
 * - Ингредиентная кластеризация: блюда с общими ингредиентами ставятся в один 3-дневный период
 */

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
const IS_WEEKEND = [false, false, false, false, false, true, true]
const MEAT_TYPES_TRACKABLE = ['poultry', 'red_meat', 'fish', 'seafood']

function getDayDate(weekStart, dayIndex) {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + dayIndex)
  return d
}

function formatDate(date) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/**
 * Вычисляет переходящие остатки из слотов предыдущей недели.
 * Возвращает { lunchLeftover } если в конце недели (сб/вс) оставались незакрытые порции.
 * @param {Array} prevSlots - слоты предыдущей недели (с полем dishes)
 */
export function calculateCarryover(prevSlots) {
  if (!prevSlots || prevSlots.length === 0) return {}

  // Группируем по dish_id
  const byDish = {}
  for (const slot of prevSlots) {
    const dish = slot.dishes
    if (!dish || (dish.servings_count ?? 1) <= 1) continue
    if (!byDish[slot.dish_id]) byDish[slot.dish_id] = { dish, slots: [] }
    byDish[slot.dish_id].slots.push(slot)
  }

  // Ищем блюдо, у которого последний слот — в выходные (день ≥ 5),
  // и при этом порций было больше, чем слотов в той неделе
  for (const { dish, slots } of Object.values(byDish)) {
    const lastDayIndex = Math.max(...slots.map(s => s.day_index))
    if (lastDayIndex < 5) continue // не дотянулось до выходных — не переносим

    const remaining = dish.servings_count - slots.length
    if (remaining <= 0) continue

    // Остатки идут в обеды следующей недели (как обычно делают leftover из ужина)
    return { lunchLeftover: { dish, remaining } }
  }

  return {}
}

/**
 * Выбирает блюдо из кандидатов с учётом ограничений
 */
function pickDish(candidates, { isWeekend, meatTypesUsed, usedDishIds, hardCountWeek = 0 }) {
  if (!candidates || candidates.length === 0) return null

  let pool = [...candidates]

  // Если будний день — убираем блюда, которые готовятся только в выходные
  if (!isWeekend) {
    const weekdayOk = pool.filter(d => !d.weekends_only)
    if (weekdayOk.length > 0) pool = weekdayOk
  }

  // Не более 1 сложного блюда за всю неделю
  if (hardCountWeek >= 1) {
    const notHard = pool.filter(d => d.difficulty !== 'hard')
    if (notHard.length > 0) pool = notHard
  }

  // Предпочитаем типы мяса, которые ещё не встречались
  const missingTypes = MEAT_TYPES_TRACKABLE.filter(t => !meatTypesUsed.has(t))
  if (missingTypes.length > 0) {
    const preferred = pool.filter(d => missingTypes.includes(d.meat_type))
    if (preferred.length > 0) pool = preferred
  }

  // Предпочитаем блюда, которые ещё не использовались на этой неделе
  const notUsed = pool.filter(d => !usedDishIds.has(d.id))
  if (notUsed.length > 0) pool = notUsed

  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Основная функция генерации меню
 * @param {Array} dishes - массив блюд с ингредиентами
 * @param {Date} weekStart - начало недели (понедельник)
 * @param {Object} carryover - переходящие остатки из предыдущей недели
 * @returns {Array} - 7 элементов, каждый {dayIndex, dayName, date, isWeekend, breakfast, lunch, dinner}
 */
export function generateMenu(dishes, weekStart, { lunchLeftover: initialLunchLeftover = null } = {}) {
  const breakfastDishes = dishes.filter(d => d.meal_types?.includes('breakfast'))
  const lunchDishes = dishes.filter(d => d.meal_types?.includes('lunch'))
  const dinnerDishes = dishes.filter(d => d.meal_types?.includes('dinner'))
  const lunchOrDinnerDishes = dishes.filter(d =>
    d.meal_types?.includes('lunch') || d.meal_types?.includes('dinner')
  )

  // Инициализируем 7 дней
  const menu = Array.from({ length: 7 }, (_, i) => ({
    dayIndex: i,
    dayName: DAY_NAMES[i],
    date: formatDate(getDayDate(weekStart, i)),
    isWeekend: IS_WEEKEND[i],
    breakfast: null,
    lunch: null,
    dinner: null,
  }))

  const meatTypesUsed = new Set()
  const usedDishIds = new Set()
  let hardCountWeek = 0

  // ========== ЗАВТРАКИ (парные) ==========
  if (breakfastDishes.length > 0) {
    const shuffledBreakfasts = shuffle(breakfastDishes)
    for (let day = 0; day < 7; day++) {
      const breakfastIdx = Math.floor(day / 2) % shuffledBreakfasts.length
      const dish = shuffledBreakfasts[breakfastIdx]
      const isLeftover = day % 2 === 1 && day > 0
      menu[day].breakfast = { dish, isLeftover }
      if (MEAT_TYPES_TRACKABLE.includes(dish.meat_type)) {
        meatTypesUsed.add(dish.meat_type)
      }
    }
  }

  // ========== ОБЕДЫ И УЖИНЫ с batch cooking ==========
  // Стартуем с переходящими остатками из предыдущей недели (если есть)
  let lunchLeftover = initialLunchLeftover
    ? { dish: initialLunchLeftover.dish, remaining: initialLunchLeftover.remaining }
    : null
  let dinnerLeftover = null

  // Если есть переходящие остатки — добавляем это блюдо в "уже использованные",
  // чтобы оно не дублировалось как свежее приготовление
  if (lunchLeftover) {
    usedDishIds.add(lunchLeftover.dish.id)
    if (MEAT_TYPES_TRACKABLE.includes(lunchLeftover.dish.meat_type)) {
      meatTypesUsed.add(lunchLeftover.dish.meat_type)
    }
  }

  for (let day = 0; day < 7; day++) {
    const isWknd = IS_WEEKEND[day]

    // --- ОБЕД ---
    if (lunchLeftover) {
      menu[day].lunch = { dish: lunchLeftover.dish, isLeftover: true }
      lunchLeftover.remaining--
      if (lunchLeftover.remaining <= 0) lunchLeftover = null
    } else {
      const lunchPool = lunchDishes.length > 0 ? lunchDishes : lunchOrDinnerDishes
      const dish = pickDish(lunchPool, { isWeekend: isWknd, meatTypesUsed, usedDishIds, hardCountWeek })
      if (dish) {
        menu[day].lunch = { dish, isLeftover: false }
        if (MEAT_TYPES_TRACKABLE.includes(dish.meat_type)) meatTypesUsed.add(dish.meat_type)
        usedDishIds.add(dish.id)
        if (dish.difficulty === 'hard') hardCountWeek++
        if (dish.servings_count > 1) {
          lunchLeftover = { dish, remaining: dish.servings_count - 1 }
        }
      }
    }

    // --- УЖИН ---
    if (dinnerLeftover) {
      menu[day].dinner = { dish: dinnerLeftover.dish, isLeftover: true }
      dinnerLeftover.remaining--
      if (dinnerLeftover.remaining <= 0) dinnerLeftover = null
    } else {
      const dinnerPool = dinnerDishes.length > 0 ? dinnerDishes : lunchOrDinnerDishes
      const dish = pickDish(dinnerPool, { isWeekend: isWknd, meatTypesUsed, usedDishIds, hardCountWeek })
      if (dish) {
        menu[day].dinner = { dish, isLeftover: false }
        if (MEAT_TYPES_TRACKABLE.includes(dish.meat_type)) meatTypesUsed.add(dish.meat_type)
        usedDishIds.add(dish.id)
        if (dish.difficulty === 'hard') hardCountWeek++
        if (dish.servings_count > 1) {
          if (!lunchLeftover) {
            lunchLeftover = { dish, remaining: dish.servings_count - 1 }
          } else {
            dinnerLeftover = { dish, remaining: dish.servings_count - 1 }
          }
        }
      }
    }
  }

  // ========== Кластеризация ингредиентов ==========
  clusterByIngredients(menu)

  return menu
}

/**
 * Пост-обработка: кластеризация блюд по общим ингредиентам
 */
function clusterByIngredients(menu) {
  const cookingSlots = []
  for (let day = 0; day < 7; day++) {
    for (const mealType of ['breakfast', 'lunch', 'dinner']) {
      const slot = menu[day][mealType]
      if (slot && !slot.isLeftover && slot.dish?.ingredients?.length > 0) {
        cookingSlots.push({ day, mealType, slot })
      }
    }
  }

  for (let i = 0; i < cookingSlots.length; i++) {
    for (let j = i + 1; j < cookingSlots.length; j++) {
      const a = cookingSlots[i]
      const b = cookingSlots[j]
      const windowA = Math.floor(a.day / 3)
      const windowB = Math.floor(b.day / 3)

      if (windowA === windowB) continue

      const sharedIngredients = getSharedIngredients(a.slot.dish, b.slot.dish)
      if (sharedIngredients.length === 0) continue

      const targetWindow = windowA
      const targetDays = [0, 1, 2].map(x => x + targetWindow * 3).filter(d => d < 7)

      for (const targetDay of targetDays) {
        if (targetDay === a.day) continue
        const targetSlot = menu[targetDay][b.mealType]
        if (!targetSlot || targetSlot.isLeftover) continue

        // Не переставляем weekends_only блюдо на будний день
        if (b.slot.dish?.weekends_only && !IS_WEEKEND[targetDay]) continue

        menu[b.day][b.mealType] = targetSlot
        menu[targetDay][b.mealType] = b.slot
        b.day = targetDay
        break
      }
    }
  }
}

function getSharedIngredients(dishA, dishB) {
  if (!dishA?.ingredients || !dishB?.ingredients) return []
  const namesA = new Set(dishA.ingredients.map(i => i.name.toLowerCase().trim()))
  return dishB.ingredients.filter(i => namesA.has(i.name.toLowerCase().trim()))
}

export function getCurrentWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function getWeekLabel(weekStart) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  return `${formatDate(weekStart)} — ${formatDate(weekEnd)}`
}
