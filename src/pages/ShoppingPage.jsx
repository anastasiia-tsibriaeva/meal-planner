import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { generateShoppingList } from '../lib/shoppingList'
import { getCurrentWeekStart } from '../lib/menuGenerator'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DAY_NAMES_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

export default function ShoppingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(null)
  const [pantryItems, setPantryItems] = useState([])
  const [selectedDays, setSelectedDays] = useState([0, 1, 2]) // по умолчанию первые 3 дня
  const [shoppingList, setShoppingList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (menu && pantryItems !== null) {
      buildList()
    }
  }, [menu, selectedDays, pantryItems])

  const loadData = async () => {
    const weekStart = getCurrentWeekStart()
    const weekStartStr = weekStart.toISOString().slice(0, 10)

    // Загружаем сохранённое меню
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
        const DAY_NAMES_LONG = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
        const IS_WEEKEND = [false, false, false, false, false, true, true]
        const menuArr = Array.from({ length: 7 }, (_, i) => ({
          dayIndex: i, dayName: DAY_NAMES_LONG[i], isWeekend: IS_WEEKEND[i],
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

    // Загружаем базовые продукты
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
        if (prev.length === 1) return prev // минимум 1 день
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

  const uncheckedCount = shoppingList.filter(i => !i.checked).length
  const checkedCount = shoppingList.filter(i => i.checked).length

  if (loading) return (
    <div className="page-container">
      <div className="spinner" style={{ marginTop: 60 }} />
    </div>
  )

  if (!menu) return (
    <div className="page-container">
      <div className="empty-state">
        <span className="icon">📅</span>
        <h3>Меню ещё не создано</h3>
        <p>Сначала составь и сохрани меню на неделю — тогда здесь появится список покупок</p>
        <button className="btn btn-primary" onClick={() => navigate('/menu')}>
          Перейти к меню
        </button>
      </div>
    </div>
  )

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Список покупок</h2>
        {shoppingList.length > 0 && (
          <span className="badge">{uncheckedCount}</span>
        )}
      </div>

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

      {/* Selected days summary */}
      {selectedDays.length > 0 && (
        <div style={{
          background: 'var(--color-primary-light)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          fontSize: '0.85rem',
          color: 'var(--color-text-secondary)',
          marginBottom: 20
        }}>
          Показываю: {selectedDays.map(d => DAY_NAMES_FULL[d]).join(', ')}
        </div>
      )}

      {/* Shopping list */}
      {shoppingList.length === 0 ? (
        <div className="empty-state">
          <span className="icon">✅</span>
          <h3>Список пуст</h3>
          <p>Либо в блюдах нет ингредиентов, либо все они в списке "всегда есть дома"</p>
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

          <div className="card">
            <div className="card-body">
              {shoppingList.map(item => (
                <div key={item.id} className="shopping-item">
                  <div
                    className={`shopping-item-check${item.checked ? ' checked' : ''}`}
                    onClick={() => toggleCheck(item.id)}
                  >
                    {item.checked && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
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
            <div className="alert alert-success" style={{ marginTop: 16 }}>
              🎉 Все продукты куплены!
            </div>
          )}
        </>
      )}
    </div>
  )
}
