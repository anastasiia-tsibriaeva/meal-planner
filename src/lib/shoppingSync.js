import { supabase } from './supabase'
import { requestShoppingItems } from './calculator'

// Должен совпадать с DEFAULT_PANTRY_ITEMS в planner/shopping.py
const DEFAULT_PANTRY_ITEMS = ['соль', 'чёрный перец', 'перец чёрный', 'перец молотый']

function normalizeIngredientName(name) {
  return (name || '').toLowerCase().trim().replace(/ё/g, 'е').replace(/\s+/g, ' ')
}

async function loadPantryItems(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('pantry_items')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !Array.isArray(data?.pantry_items)) return DEFAULT_PANTRY_ITEMS
  return data.pantry_items
}

/**
 * Пересобирает пункты «Из меню» для недели по текущему меню.
 * Отметку «куплено» переносим на пункты с тем же ингредиентом.
 *
 * @param {string} userId
 * @param {string} weekStartStr — «YYYY-MM-DD»
 * @param {Array<{dish, servingsUsed}>} cookingSlots — только дни готовки (не остатки)
 * @returns {{ items?: Array, error?: object }}
 */
// Пересборки идут строго по очереди: если страница меню и страница покупок
// одновременно пересоберут список, получится два списка вместо одного.
let syncQueue = Promise.resolve()

export function syncMenuShoppingItems(userId, weekStartStr, cookingSlots) {
  const run = syncQueue.then(() => doSync(userId, weekStartStr, cookingSlots))
  syncQueue = run.catch(() => {})
  return run
}

async function doSync(userId, weekStartStr, cookingSlots) {
  const pantry = await loadPantryItems(userId)
  let fresh
  try {
    fresh = await requestShoppingItems(cookingSlots, pantry)
  } catch (err) {
    return { error: err }  // калькулятор не ответил — старый список не трогаем
  }

  const { data: existing, error: loadErr } = await supabase
    .from('shopping_items')
    .select('id, text, checked')
    .eq('user_id', userId)
    .eq('source', 'menu')
    .eq('week_start_date', weekStartStr)
  if (loadErr) return { error: loadErr }

  const checkedTexts = (existing || [])
    .filter(i => i.checked)
    .map(i => normalizeIngredientName(i.text))
  const wasChecked = key =>
    checkedTexts.some(t => t === key || t.startsWith(key + ' '))

  // Сначала добавляем новый список, потом удаляем старый — чтобы список не пропадал
  // даже на мгновение (его в это время может читать другое устройство)
  let inserted = []
  if (fresh.length > 0) {
    const { data, error: insErr } = await supabase
      .from('shopping_items')
      .insert(fresh.map((item, i) => ({
        user_id:         userId,
        text:            item.text,
        checked:         wasChecked(item.key),
        sort_order:      i,
        source:          'menu',
        week_start_date: weekStartStr,
      })))
      .select()
    if (insErr) return { error: insErr }
    inserted = data || []
  }

  if (existing?.length) {
    const { error: delErr } = await supabase
      .from('shopping_items')
      .delete()
      .in('id', existing.map(i => i.id))
    if (delErr) return { error: delErr }
  }

  return { items: inserted.sort((a, b) => a.sort_order - b.sort_order) }
}
