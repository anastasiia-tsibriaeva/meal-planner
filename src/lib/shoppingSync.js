import { supabase } from './supabase'
import { buildShoppingItems, normalizeIngredientName, DEFAULT_PANTRY_ITEMS } from './shoppingList'

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
export async function syncMenuShoppingItems(userId, weekStartStr, cookingSlots) {
  const pantry = await loadPantryItems(userId)
  const fresh = buildShoppingItems(cookingSlots, pantry)

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

  if (existing?.length) {
    const { error: delErr } = await supabase
      .from('shopping_items')
      .delete()
      .in('id', existing.map(i => i.id))
    if (delErr) return { error: delErr }
  }

  if (fresh.length === 0) return { items: [] }

  const { data: inserted, error: insErr } = await supabase
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

  return { items: (inserted || []).sort((a, b) => a.sort_order - b.sort_order) }
}
