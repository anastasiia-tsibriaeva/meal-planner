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

const CLUSTER_MEAL_TYPES = ['breakfast', 'lunch', 'dinner']
const windowOf = day => Math.floor(day / 3)
const canStartOn = (dish, day) => !dish?.weekends_only || IS_WEEKEND[day]

/**
 * Разбивает меню на «блоки приготовления»: день готовки + идущие за ним дни остатков
 * того же блюда в том же приёме пищи.
 */
function buildCookingBlocks(menu) {
  const blocks = []
  for (const mealType of CLUSTER_MEAL_TYPES) {
    let current = null
    for (let day = 0; day < 7; day++) {
      if (!menu[day].isActive) continue
      const slot = menu[day][mealType]
      if (!slot?.dish) { current = null; continue }
      if (!slot.isLeftover) {
        current = { mealType, days: [day], dish: slot.dish }
        blocks.push(current)
      } else if (current && current.dish.id === slot.dish.id) {
        current.days.push(day)
      } else {
        current = null
      }
    }
  }
  return blocks
}

function swapBlocks(menu, b, c) {
  const bSlots = b.days.map(d => menu[d][b.mealType])
  const cSlots = c.days.map(d => menu[d][c.mealType])
  b.days.forEach((d, k) => { menu[d][b.mealType] = cSlots[k] })
  c.days.forEach((d, k) => { menu[d][c.mealType] = bSlots[k] })
  const tmp = b.dish
  b.dish = c.dish
  c.dish = tmp
}

/**
 * Пост-обработка: блюда с общими ингредиентами сдвигаем в один 3-дневный период.
 * Двигаем блоки целиком (готовка + её остатки) и меняем местами только блоки
 * одинаковой длины в одном приёме пищи — так остатки никогда не окажутся раньше готовки.
 */
function clusterByIngredients(menu) {
  const blocks = buildCookingBlocks(menu)

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]
      const b = blocks[j]
      const targetWindow = windowOf(a.days[0])
      if (targetWindow === windowOf(b.days[0])) continue
      if (getSharedIngredients(a.dish, b.dish).length === 0) continue

      const c = blocks.find(x =>
        x !== a && x !== b &&
        x.mealType === b.mealType &&
        x.days.length === b.days.length &&
        windowOf(x.days[0]) === targetWindow &&
        canStartOn(b.dish, x.days[0]) &&
        canStartOn(x.dish, b.days[0]) &&
        getSharedIngredients(a.dish, x.dish).length === 0
      )
      if (!c) continue

      swapBlocks(menu, b, c)
    }
  }
}

function getSharedIngredients(dishA, dishB) {
  if (!dishA?.ingredients || !dishB?.ingredients) return []
  const norm = n => (n || '').toLowerCase().trim().replace(/ё/g, 'е')
  const namesA = new Set(dishA.ingredients.map(i => norm(i.name)))
  return dishB.ingredients.filter(i => namesA.has(norm(i.name)))
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

/**
 * Ключ недели «YYYY-MM-DD» по локальной дате (без перевода в UTC —
 * иначе летом в UTC+1 понедельник 00:00 превращается в воскресенье).
 */
export function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
