/**
 * Генератор меню на неделю
 *
 * Правила:
 * - Завтраки: одно блюдо на 2 активных дня подряд
 * - Обеды и ужины: подбираем блюда так, чтобы сумма порций = число активных дней
 *   (без остатков в конце недели)
 * - Порции с servings_count 2 или 3 можно растягивать/сжимать между 2 и 3
 * - weekends_only: блюдо стартует только в выходной день
 * - Не более 1 сложного блюда за всю неделю
 * - Разнообразие мяса: охватываем как можно больше из 4 типов
 * - Ингредиентная кластеризация: блюда с общими ингредиентами — в один период
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
 * Выбирает блюдо из кандидатов с учётом всех ограничений.
 */
function pickDish(candidates, { isWeekend, meatTypesUsed, usedDishIds, hardCountWeek = 0, slotsRemaining = Infinity }) {
  if (!candidates || candidates.length === 0) return null

  let pool = [...candidates]

  if (!isWeekend) {
    const weekdayOk = pool.filter(d => !d.weekends_only)
    if (weekdayOk.length > 0) pool = weekdayOk
  }

  if (hardCountWeek >= 1) {
    const notHard = pool.filter(d => d.difficulty !== 'hard')
    if (notHard.length > 0) pool = notHard
  }

  const missingTypes = MEAT_TYPES_TRACKABLE.filter(t => !meatTypesUsed.has(t))
  if (missingTypes.length > 0) {
    const preferred = pool.filter(d => missingTypes.includes(d.meat_type))
    if (preferred.length > 0) pool = preferred
  }

  const notUsed = pool.filter(d => !usedDishIds.has(d.id))
  if (notUsed.length > 0) pool = notUsed

  if (slotsRemaining !== Infinity && slotsRemaining > 0) {
    const fits = pool.filter(d => {
      const s = d.servings_count ?? 1
      if (s <= slotsRemaining) return true
      if (s === 3 && slotsRemaining >= 2) return true
      return false
    })
    if (fits.length > 0) pool = fits
  }

  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Вычисляет эффективное количество порций блюда с учётом 2↔3 flex.
 */
function getEffectiveServings(dish, remaining) {
  const s = dish.servings_count ?? 1

  if (s !== 2 && s !== 3) return Math.min(s, remaining)

  if (remaining <= 1) return 1
  if (remaining === 2) return 2
  if (remaining === 3) return 3

  const rem2 = remaining - 2
  const rem3 = remaining - 3
  const score2 = rem2 % 3 === 0 ? 0 : (rem2 % 2 === 0 ? 1 : 2)
  const score3 = rem3 >= 0 ? (rem3 % 2 === 0 ? 0 : (rem3 % 3 === 0 ? 1 : 2)) : 99
  return score3 <= score2 ? 3 : 2
}

/**
 * Планирует последовательность блюд для одного типа приёма пищи.
 * Возвращает { plan: [{dish, servings}], usedDishIds, meatTypesUsed, hardCountWeek }
 */
function planMealSlots(dishes, activeDays, { meatTypesUsed, usedDishIds, hardCountWeek }) {
  if (!dishes || dishes.length === 0) {
    return { plan: [], usedDishIds: new Set(usedDishIds), meatTypesUsed: new Set(meatTypesUsed), hardCountWeek }
  }

  const target = activeDays.length
  const plan = []
  const used = new Set(usedDishIds)
  const meatUsed = new Set(meatTypesUsed)
  let hardCount = hardCountWeek
  let filled = 0
  let safety = 0

  while (filled < target && safety < 40) {
    safety++
    const remaining = target - filled
    const startDayIdx = activeDays[filled] ?? activeDays[activeDays.length - 1]
    const isWeekend = IS_WEEKEND[startDayIdx]

    const dish = pickDish(dishes, {
      isWeekend,
      meatTypesUsed: meatUsed,
      usedDishIds: used,
      hardCountWeek: hardCount,
      slotsRemaining: remaining,
    })

    if (!dish) break

    const servings = getEffectiveServings(dish, remaining)

    plan.push({ dish, servings })
    used.add(dish.id)
    if (MEAT_TYPES_TRACKABLE.includes(dish.meat_type)) meatUsed.add(dish.meat_type)
    if (dish.difficulty === 'hard') hardCount++
    filled += servings
  }

  return { plan, usedDishIds: used, meatTypesUsed: meatUsed, hardCountWeek: hardCount }
}

/**
 * Разворачивает план [{dish, servings}] в очередь слотов [{dish, isLeftover, servingsUsed}].
 * servingsUsed — реальное количество порций этого конкретного приготовления
 * (может отличаться от dish.servings_count из-за 2↔3 flex).
 */
function expandPlan(plan) {
  return plan.flatMap(({ dish, servings }) => [
    { dish, isLeftover: false, servingsUsed: servings },
    ...Array.from({ length: servings - 1 }, () => ({ dish, isLeftover: true, servingsUsed: servings })),
  ])
}

/**
 * Основная функция генерации меню.
 */
export function generateMenu(dishes, weekStart, { activeDays = [0, 1, 2, 3, 4, 5, 6] } = {}) {
  const breakfastDishes    = dishes.filter(d => d.meal_types?.includes('breakfast'))
  const lunchDishes        = dishes.filter(d => d.meal_types?.includes('lunch'))
  const dinnerDishes       = dishes.filter(d => d.meal_types?.includes('dinner'))
  const lunchOrDinnerDishes = dishes.filter(d =>
    d.meal_types?.includes('lunch') || d.meal_types?.includes('dinner')
  )

  const menu = Array.from({ length: 7 }, (_, i) => ({
    dayIndex:  i,
    dayName:   DAY_NAMES[i],
    date:      formatDate(getDayDate(weekStart, i)),
    isWeekend: IS_WEEKEND[i],
    isActive:  activeDays.includes(i),
    breakfast: null,
    lunch:     null,
    dinner:    null,
  }))

  const meatTypesUsed = new Set()
  const usedDishIds   = new Set()
  let   hardCountWeek = 0

  // ========== ЗАВТРАКИ (попарно по активным дням) ==========
  if (breakfastDishes.length > 0) {
    const shuffled = shuffle(breakfastDishes)
    activeDays.forEach((dayIdx, i) => {
      const dishIdx    = Math.floor(i / 2) % shuffled.length
      const dish       = shuffled[dishIdx]
      const isLeftover = i % 2 === 1
      // Для завтраков считаем реальное число дней этого приготовления
      const servingsUsed = (!isLeftover && i + 1 < activeDays.length) ? 2 : isLeftover ? 2 : 1
      menu[dayIdx].breakfast = { dish, isLeftover, servingsUsed }
      if (MEAT_TYPES_TRACKABLE.includes(dish.meat_type)) meatTypesUsed.add(dish.meat_type)
    })
  }

  // ========== ОБЕДЫ ==========
  const lunchPool   = lunchDishes.length > 0 ? lunchDishes : lunchOrDinnerDishes
  const lunchResult = planMealSlots(lunchPool, activeDays, {
    meatTypesUsed:  new Set(meatTypesUsed),
    usedDishIds:    new Set(usedDishIds),
    hardCountWeek,
  })
  const lunchQueue = expandPlan(lunchResult.plan)
  lunchResult.usedDishIds.forEach(id => usedDishIds.add(id))
  lunchResult.meatTypesUsed.forEach(m => meatTypesUsed.add(m))
  hardCountWeek = lunchResult.hardCountWeek

  // ========== УЖИНЫ ==========
  const dinnerPool   = dinnerDishes.length > 0 ? dinnerDishes : lunchOrDinnerDishes
  const dinnerResult = planMealSlots(dinnerPool, activeDays, {
    meatTypesUsed:  new Set(meatTypesUsed),
    usedDishIds:    new Set(usedDishIds),
    hardCountWeek,
  })
  const dinnerQueue = expandPlan(dinnerResult.plan)

  // ========== Расставляем по активным дням ==========
  activeDays.forEach((dayIdx, i) => {
    if (lunchQueue[i])  menu[dayIdx].lunch  = lunchQueue[i]
    if (dinnerQueue[i]) menu[dayIdx].dinner = dinnerQueue[i]
  })

  // ========== Кластеризация ингредиентов ==========
  clusterByIngredients(menu)

  return menu
}

/**
 * Пост-обработка: блюда с общими ингредиентами сдвигаем в один 3-дневный период.
 */
function clusterByIngredients(menu) {
  const cookingSlots = []
  for (let day = 0; day < 7; day++) {
    if (!menu[day].isActive) continue
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
      if (Math.floor(a.day / 3) === Math.floor(b.day / 3)) continue
      if (getSharedIngredients(a.slot.dish, b.slot.dish).length === 0) continue

      const targetWindow = Math.floor(a.day / 3)
      const targetDays   = [0, 1, 2].map(x => x + targetWindow * 3).filter(d => d < 7)

      for (const targetDay of targetDays) {
        if (targetDay === a.day) continue
        if (!menu[targetDay].isActive) continue
        const targetSlot = menu[targetDay][b.mealType]
        if (!targetSlot || targetSlot.isLeftover) continue
        if (b.slot.dish?.weekends_only && !IS_WEEKEND[targetDay]) continue

        menu[b.day][b.mealType]     = targetSlot
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
  const now  = new Date()
  const day  = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
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
