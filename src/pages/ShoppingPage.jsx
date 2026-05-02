import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { generateShoppingList } from '../lib/shoppingList'
import { getCurrentWeekStart } from '../lib/menuGenerator'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DAY_NAMES_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
    </svg>
  )
}

export default function ShoppingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(null)
  const [pantryItems, setPantryItems] = useState([])
  const [selectedDays, setSelectedDays] = useState([0, 1, 2])
  const [shoppingList, setShoppingList] = useState([])
  const [loading, setLoading] = useState(true)

  // Manual items
  const STORAGE_KEY = `manual_shopping_${user.id}`
  const [manualItems, setManualItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    } catch {
      return []
    }
  })
  const [newItemText, setNewItemText] = useState('')
  const inputRef = useRef(null)

  // Persist manual items to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(manualItems))
  }, [manualItems])

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (menu && pantryItems !== null) buildList()
  }, [menu, selectedDays, pantryItems])

  const loadData = async () => {
    const weekStart = getCurrentWeekStart()
    const weekStartStr = weekStart.toISOString().slice(0, 10)

    const { data: menuData } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStartStr)
      .single()

    if (menuData) {
      const { data: slots } = await supabase
        .from('menu_slots')
        .select('*, dishes(*, ingredients(*))')
        .eq('menu_id', menuData.id)

      if (slots) {
        const IS_WEEKEND = [false, false, false, false, false, true, true]
        const menuArr = Array.from({ length: 7 }, (_, i) => ({
          dayIndex: i, dayName: DAY_NAMES_FULL[i], isWeekend: IS_WEEKEND[i],
          breakfast: null, lunch: null, dinner: null
        }))
        for (const slot of slots) {
          if (slot.day_index >= 0 && slot.day_index < 7) {
            menuArr[slot.day_index][slot.meal_type] = { dish: slot.dishes, isLeftover: slot.is_leftover }
          }
        }
        setMenu(menuArr)
      }
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('pantry_items')
      .eq('user_id', user.id)
      .single()

    setPantryItems(settings?.pantry_items || ['соль', 'чёрный перец', 'перец молотый'])
    setLoading(false)
  }

  const buildList = () => {
    if (!menu) return
    const minDay = Math.min(...selectedDays)
    const maxDay = Math.max(...selectedDays)
    const list = generateShoppingList(menu, minDay, maxDay, pantryItems)
    setShoppingList(list)
  }

  const toggleDay = (dayIndex) => {
    setSelectedDays(prev => {
      if (prev.includes(dayIndex)) {
        if (prev.length === 1) return prev
        return prev.filter(d => d !== dayIndex)
      } else {
        return [...prev, dayIndex].sort((a, b) => a - b)
      }
    })
  }

  const selectRange = (start, end) => {
    const range = []
    for (let i = start; i <= end; i++) range.push(i)
    setSelectedDays(range)
  }

  const toggleCheck = (id) => {
    setShoppingList(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item))
  }

  // Manual items handlers
  const addManualItem = () => {
    const text = newItemText.trim()
    if (!text) return
    setManualItems(prev => [...prev, { id: crypto.randomUUID(), name: text, checked: false }])
    setNewItemText('')
    inputRef.current?.focus()
  }

  const toggleManualCheck = (id) => {
    setManualItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item))
  }

  const deleteManualItem = (id) => {
    setManualItems(prev => prev.filter(item => item.id !== id))
  }

  const clearCheckedManual = () => {
    setManualItems(prev => prev.filter(item => !item.checked))
  }

  const uncheckedCount = shoppingList.filter(i => !i.checked).length
  const checkedCount = shoppingList.filter(i => i.checked).length
  const manualUnchecked = manualItems.filter(i => !i.checked).length
  const manualChecked = manualItems.filter(i => i.checked).length

  if (loading) return (
    <div className="page-container">
      <div className="spinner" style={{ marginTop: 60 }} />
    </div>
  )

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Список покупок</h2>
      </div>

      {/* ── ИЗ МЕНЮ ── */}
      {menu ? (
        <>
          {/* Day selector */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 8, color: 'var(--color-text)' }}>
              Выбери дни:
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {DAY_NAMES.map((name, i) => (
                <button
                  key={i}
                  className={`day-btn${selectedDays.includes(i) ? ' selected' : ''}`}
                  onClick={() => toggleDay(i)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => selectRange(0, 2)}>Пн–Ср</button>
              <button className="btn btn-ghost btn-sm" onClick={() => selectRange(3, 5)}>Чт–Сб</button>
              <button className="btn btn-ghost btn-sm" onClick={() => selectRange(0, 6)}>Вся неделя</button>
            </div>
          </div>

          {selectedDays.length > 0 && (
            <div style={{
              background: 'var(--color-primary-light)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              fontSize: '0.85rem',
              color: 'var(--color-text-secondary)',
              marginBottom: 20,
            }}>
              Показываю: {selectedDays.map(d => DAY_NAMES_FULL[d]).join(', ')}
            </div>
          )}

          <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            Из меню
          </div>

          {shoppingList.length === 0 ? (
            <div style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              border: '0.5px solid var(--color-border)',
              fontSize: '0.875rem',
              color: 'var(--color-text-secondary)',
              marginBottom: 28,
              textAlign: 'center',
            }}>
              В блюдах выбранных дней нет ингредиентов
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="text-sm text-secondary">
                  {uncheckedCount > 0 ? `${uncheckedCount} позиций` : ''}
                  {checkedCount > 0 ? ` · куплено ${checkedCount}` : ''}
                </span>
                {checkedCount > 0 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShoppingList(prev => prev.map(i => ({ ...i, checked: false })))}
                  >
                    Сбросить отметки
                  </button>
                )}
              </div>

              <div className="card" style={{ marginBottom: 28 }}>
                <div className="card-body">
                  {shoppingList.map(item => (
                    <div key={item.id} className="shopping-item">
                      <div
                        className={`shopping-item-check${item.checked ? ' checked' : ''}`}
                        onClick={() => toggleCheck(item.id)}
                      >
                        {item.checked && <CheckIcon />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span className={`shopping-item-name${item.checked ? ' checked' : ''}`}>
                          {item.name}
                        </span>
                        {item.dishes.length > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
                            {item.dishes.join(', ')}
                          </div>
                        )}
                      </div>
                      {item.displayQty && (
                        <span className="shopping-item-qty">{item.displayQty}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {checkedCount === shoppingList.length && shoppingList.length > 0 && (
                <div className="alert alert-success" style={{ marginBottom: 28 }}>
                  🎉 Все продукты из меню куплены!
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          border: '0.5px solid var(--color-border)',
          fontSize: '0.875rem',
          color: 'var(--color-text-secondary)',
          marginBottom: 28,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <span>Меню на эту неделю ещё не создано</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/menu')}>
            Перейти к меню →
          </button>
        </div>
      )}

      {/* ── МОИ ДОБАВЛЕНИЯ ── */}
      <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', marginBottom: 10 }}>
        Мои добавления
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          ref={inputRef}
          type="text"
          className="form-input"
          placeholder="Добавить товар..."
          value={newItemText}
          onChange={e => setNewItemText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addManualItem()}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-primary"
          onClick={addManualItem}
          disabled={!newItemText.trim()}
          style={{ flexShrink: 0 }}
        >
          <PlusIcon />
        </button>
      </div>

      {manualItems.length === 0 ? (
        <div style={{
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          border: '0.5px dashed var(--color-border)',
          fontSize: '0.875rem',
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
        }}>
          Пока ничего нет — добавь первый товар выше
        </div>
      ) : (
        <>
          {manualChecked > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={clearCheckedManual}>
                Удалить купленные
              </button>
            </div>
          )}
          <div className="card">
            <div className="card-body">
              {manualItems.map(item => (
                <div key={item.id} className="shopping-item">
                  <div
                    className={`shopping-item-check${item.checked ? ' checked' : ''}`}
                    onClick={() => toggleManualCheck(item.id)}
                  >
                    {item.checked && <CheckIcon />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span className={`shopping-item-name${item.checked ? ' checked' : ''}`}>
                      {item.name}
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => deleteManualItem(item.id)}
                    style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
