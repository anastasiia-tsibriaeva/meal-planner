/**
 * Генератор меню на неделю
 * Правила:
 * - Завтраки: одно и то же блюдо 2 дня подряд
 * - Будни (пн-пт): только лёгкие и средние блюда
 * - Выходные (сб-вс): любая сложность, но не более 1 сложного блюда в день
 * - Разнообразие мяса: стараемся охватить хотя бы 3 из 4 типов (птица, рыба, морепродукты, красное мясо)
 * - Batch cooking: блюдо с servings_count>1 покрывает несколько слотов
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
 * Выбирает блюдо из кандидатов с учётом ограничений
 */
function pickDish(candidates, { isWeekend, meatTypesUsed, usedDishIds, hardCountToday = 0 }) {
  if (!candidates || candidates.length === 0) return null

  let pool = [...candidates]

  // Фильтр по сложности
  if (!isWeekend) {
    const easyMedium = pool.filter(d => d.difficulty === 'easy' || d.difficulty === 'medium')
    if (easyMedium.length > 0) pool = easyMedium
  } else {
    // В выходные: не более 1 сложного блюда в день
    if (hardCountToday >= 1) {
      const notHard = pool.filter(d => d.difficulty !== 'hard')
      if (notHard.length > 0) pool = notHard
    }
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
 * @returns {Array} - 7 элементов, каждый {dayIndex, dayName, date, isWeekend, breakfast, lunch, dinner}
 */
export function generateMenu(dishes, weekStart) {
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

  // ========== ЗАВТРАКИ (парные) ==========
  if (breakfastDishes.length > 0) {
    const shuffledBreakfasts = shuffle(breakfastDishes)
    // Пары: [0,1], [2,3], [4,5], [6] - последний день берём любой
    let bIdx = 0
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
  let lunchLeftover = null  // { dish, remaining }
  let dinnerLeftover = null

  for (let day = 0; day < 7; day++) {
    const isWknd = IS_WEEKEND[day]
    let hardCountToday = 0

    // --- ОБЕД ---
    if (lunchLeftover) {
      menu[day].lunch = { dish: lunchLeftover.dish, isLeftover: true }
      lunchLeftover.remaining--
      if (lunchLeftover.remaining <= 0) lunchLeftover = null
    } else {
      const lunchPool = lunchDishes.length > 0 ? lunchDishes : lunchOrDinnerDishes
      const dish = pickDish(lunchPool, { isWeekend: isWknd, meatTypesUsed, usedDishIds, hardCountToday })
      if (dish) {
        menu[day].lunch = { dish, isLeftover: false }
        if (MEAT_TYPES_TRACKABLE.includes(dish.meat_type)) meatTypesUsed.add(dish.meat_type)
        usedDishIds.add(dish.id)
        if (dish.difficulty === 'hard') hardCountToday++
        if (dish.servings_count > 1) {
          lunchLeftover = { dish, remaining: dish.servings_count - 1 }
        }
      }
    }

    if (menu[day].lunch?.dish?.difficulty === 'hard') hardCountToday = 1

    // --- УЖИН ---
    if (dinnerLeftover) {
      menu[day].dinner = { dish: dinnerLeftover.dish, isLeftover: true }
      dinnerLeftover.remaining--
      if (dinnerLeftover.remaining <= 0) dinnerLeftover = null
    } else {
      const dinnerPool = dinnerDishes.length > 0 ? dinnerDishes : lunchOrDinnerDishes
      const dish = pickDish(dinnerPool, { isWeekend: isWknd, meatTypesUsed, usedDishIds, hardCountToday })
      if (dish) {
        menu[day].dinner = { dish, isLeftover: false }
        if (MEAT_TYPES_TRACKABLE.includes(dish.meat_type)) meatTypesUsed.add(dish.meat_type)
        usedDishIds.add(dish.id)
        if (dish.servings_count > 1) {
          // Остатки ужина → на обед следующего дня (если он ещё не занят)
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
  // Пробуем переставить блюда так, чтобы блюда с общими ингредиентами
  // оказались в одном 3-дневном окне
  clusterByIngredients(menu)

  return menu
}

/**
 * Пост-обработка: кластеризация блюд по общим ингредиентам
 * Смотрим на 2 окна: [0-2] и [3-5], день 6 оставляем как есть
 */
function clusterByIngredients(menu) {
  // Собираем все "кулинарные" слоты (не остатки)
  const cookingSlots = []
  for (let day = 0; day < 7; day++) {
    for (const mealType of ['breakfast', 'lunch', 'dinner']) {
      const slot = menu[day][mealType]
      if (slot && !slot.isLeftover && slot.dish?.ingredients?.length > 0) {
        cookingSlots.push({ day, mealType, slot })
      }
    }
  }

  // Ищем пары слотов с общими ингредиентами в разных окнах
  for (let i = 0; i < cookingSlots.length; i++) {
    for (let j = i + 1; j < cookingSlots.length; j++) {
      const a = cookingSlots[i]
      const b = cookingSlots[j]
      const windowA = Math.floor(a.day / 3)
      const windowB = Math.floor(b.day / 3)

      if (windowA === windowB) continue // уже в одном окне

      const sharedIngredients = getSharedIngredients(a.slot.dish, b.slot.dish)
      if (sharedIngredients.length === 0) continue

      // Пробуем найти слот в том же окне, куда можно переместить b
      const targetWindow = windowA
      const targetDays = [0, 1, 2].map(x => x + targetWindow * 3).filter(d => d < 7)

      for (const targetDay of targetDays) {
        if (targetDay === a.day) continue
        // Проверяем, можно ли поменять местами b и какой-то слот из targetWindow
        const targetSlot = menu[targetDay][b.mealType]
        if (!targetSlot || targetSlot.isLeftover) continue

        // Меняем местами
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

/**
 * Возвращает начало текущей недели (понедельник)
 */
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
