import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { generateMenu, getCurrentWeekStart, getWeekLabel } from '../lib/menuGenerator'

const MEAL_LABELS = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' }

function pluralizeMeals(n) {
  const lastTwo = n % 100
  const lastOne = n % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${n} приёмов пищи`
  if (lastOne === 1) return `${n} приём пищи`
  if (lastOne >= 2 && lastOne <= 4) return `${n} приёма пищи`
  return `${n} приёмов пищи`
}
const MEAT_LABELS = {
  poultry: 'Птица', fish: 'Рыба', seafood: 'Морепродукты',
  red_meat: 'Красное мясо', none: 'Без мяса'
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
    </svg>
  )
}

function SwapIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}

export default function MenuPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [dishes, setDishes] = useState([])
  const [menu, setMenu] = useState(null)
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [swapModal, setSwapModal] = useState(null) // { dayIndex, mealType }

  useEffect(() => { loadDishes() }, [])

  useEffect(() => {
    if (dishes.length > 0) loadOrGenerateMenu()
  }, [dishes, weekStart])

  const loadDishes = async () => {
    const { data } = await supabase
      .from('dishes')
      .select('*, ingredients(id, name, quantity, unit)')
      .eq('user_id', user.id)
    setDishes(data || [])
    setLoading(false)
  }

  const loadOrGenerateMenu = useCallback(async () => {
    setLoading(true)
    const weekStartStr = weekStart.toISOString().slice(0, 10)

    // Ищем сохранённое меню для этой недели
    const { data: existingMenu } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStartStr)
      .single()

    if (existingMenu) {
      const { data: slots } = await supabase
        .from('menu_slots')
        .select('*, dishes(*, ingredients(*))')
        .eq('menu_id', existingMenu.id)
        .order('day_index')

      if (slots) {
        const menuData = buildMenuFromSlots(slots)
        setMenu(menuData)
        setLoading(false)
        return
      }
    }

    // Генерируем новое меню
    if (dishes.length > 0) {
      const generated = generateMenu(dishes, weekStart)
      setMenu(generated)
    }
    setLoading(false)
  }, [dishes, weekStart, user.id])

  function buildMenuFromSlots(slots) {
    const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
    const IS_WEEKEND = [false, false, false, false, false, true, true]
    const menu = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i)
      return {
        dayIndex: i, dayName: DAY_NAMES[i], isWeekend: IS_WEEKEND[i],
        date: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
        breakfast: null, lunch: null, dinner: null
      }
    })
    for (const slot of slots) {
      if (slot.day_index >= 0 && slot.day_index < 7) {
        menu[slot.day_index][slot.meal_type] = {
          dish: slot.dishes,
          isLeftover: slot.is_leftover
        }
      }
    }
    return menu
  }

  const regenerate = () => {
    if (dishes.length === 0) return
    const generated = generateMenu(dishes, weekStart)
    setMenu(generated)
    setSaved(false)
  }

  const saveMenu = async () => {
    if (!menu) return
    setSaving(true)
    const weekStartStr = weekStart.toISOString().slice(0, 10)

    // Удаляем старое меню для этой недели
    await supabase
      .from('weekly_menus')
      .delete()
      .eq('user_id', user.id)
      .eq('week_start_date', weekStartStr)

    // Создаём новое
    const { data: newMenu } = await supabase
      .from('weekly_menus')
      .insert({ user_id: user.id, week_start_date: weekStartStr })
      .select()
      .single()

    if (!newMenu) { setSaving(false); return }

    // Вставляем слоты
    const slots = []
    for (const day of menu) {
      for (const mealType of ['breakfast', 'lunch', 'dinner']) {
        const slot = day[mealType]
        if (slot?.dish) {
          slots.push({
            menu_id: newMenu.id,
            day_index: day.dayIndex,
            meal_type: mealType,
            dish_id: slot.dish.id,
            is_leftover: slot.isLeftover,
          })
        }
      }
    }

    await supabase.from('menu_slots').insert(slots)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const openSwapModal = (dayIndex, mealType) => {
    setSwapModal({ dayIndex, mealType })
  }

  const swapDish = (newDish) => {
    if (!swapModal) return
    const { dayIndex, mealType } = swapModal
    setMenu(prev => prev.map(day =>
      day.dayIndex === dayIndex
        ? { ...day, [mealType]: { dish: newDish, isLeftover: false } }
        : day
    ))
    setSwapModal(null)
    setSaved(false)
  }

  const changeWeek = (delta) => {
    const newStart = new Date(weekStart)
    newStart.setDate(newStart.getDate() + delta * 7)
    setWeekStart(newStart)
    setSaved(false)
  }

  // Статистика разнообразия мяса
  const getMeatStats = () => {
    if (!menu) return []
    const used = new Set()
    for (const day of menu) {
      for (const mealType of ['breakfast', 'lunch', 'dinner']) {
        const slot = day[mealType]
        if (slot?.dish?.meat_type && slot.dish.meat_type !== 'none' && !slot.isLeftover) {
          used.add(slot.dish.meat_type)
        }
      }
    }
    return Array.from(used)
  }

  const meatStats = getMeatStats()

  const swapCandidates = swapModal
    ? dishes.filter(d => d.meal_types?.includes(swapModal.mealType))
    : []

  if (loading && !menu) return (
    <div className="page-container">
      <div className="spinner" style={{ marginTop: 60 }} />
    </div>
  )

  if (dishes.length === 0) return (
    <div className="page-container">
      <div className="empty-state">
        <span className="icon">📖</span>
        <h3>Сначала добавь блюда</h3>
        <p>Чтобы генерировать меню, нужно хотя бы несколько блюд в базе</p>
        <button className="btn btn-primary" onClick={() => navigate('/dishes/new')}>
          Добавить первое блюдо
        </button>
      </div>
    </div>
  )

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Меню на неделю</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={regenerate} disabled={loading}>
            <RefreshIcon /> Перегенерировать
          </button>
          <button className="btn btn-primary" onClick={saveMenu} disabled={saving || !menu}>
            <SaveIcon /> {saving ? 'Сохраняем...' : saved ? '✓ Сохранено' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="week-nav">
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => changeWeek(-1)}>←</button>
        <span className="week-nav-label">{getWeekLabel(weekStart)}</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => changeWeek(1)}>→</button>
      </div>

      {/* Meat diversity stats */}
      {menu && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="text-sm text-secondary">Разнообразие мяса:</span>
          {['poultry', 'red_meat', 'fish', 'seafood'].map(type => (
            <span
              key={type}
              className="tag"
              style={{
                background: meatStats.includes(type) ? 'var(--color-primary-light)' : 'var(--color-bg)',
                color: meatStats.includes(type) ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                border: `1px solid ${meatStats.includes(type) ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}
            >
              {meatStats.includes(type) ? '✓' : '○'} {MEAT_LABELS[type]}
            </span>
          ))}
        </div>
      )}

      {/* Menu grid */}
      {menu && (
        <div className="menu-grid">
          {menu.map(day => (
            <div key={day.dayIndex} className="menu-day-card">
              <div className="menu-day-header">
                <span className="menu-day-name">
                  {day.isWeekend ? '🌅 ' : ''}{day.dayName}
                </span>
                <span className="menu-day-date">{day.date}</span>
              </div>
              <div className="menu-meals">
                {['breakfast', 'lunch', 'dinner'].map(mealType => {
                  const slot = day[mealType]
                  return (
                    <div key={mealType} className="menu-meal">
                      <div className="menu-meal-label">{MEAL_LABELS[mealType]}</div>
                      {slot?.dish ? (
                        <>
                          <div className="menu-meal-dish">{slot.dish.name}</div>
                          {slot.isLeftover && (
                            <div className="menu-meal-leftover">🍱 остатки</div>
                          )}
                          {!slot.isLeftover && slot.dish.servings_count > 1 && (
                            <div style={{ fontSize: '0.72rem', color: '#3B6D11', marginTop: 2 }}>
                              Хватит на {pluralizeMeals(slot.dish.servings_count)}
                            </div>
                          )}
                          {slot.dish.recipe_link && !slot.isLeftover && (
                            <a
                              href={slot.dish.recipe_link}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginTop: 2, display: 'block' }}
                            >
                              🎬 рецепт
                            </a>
                          )}
                          {!slot.isLeftover && (
                            <button
                              className="menu-meal-change btn btn-ghost btn-sm"
                              onClick={() => openSwapModal(day.dayIndex, mealType)}
                              title="Заменить блюдо"
                              style={{ marginTop: 4, fontSize: '0.75rem', padding: '3px 8px' }}
                            >
                              <SwapIcon /> заменить
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="menu-meal-empty">не задано</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Swap modal */}
      {swapModal && (
        <div className="modal-overlay" onClick={() => setSwapModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                Заменить {MEAL_LABELS[swapModal.mealType].toLowerCase()}
              </span>
              <button className="btn btn-ghost btn-icon" onClick={() => setSwapModal(null)}>✕</button>
            </div>
            {swapCandidates.length === 0 ? (
              <p className="text-sm text-secondary">Нет блюд для этого типа приёма пищи</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {swapCandidates.map(dish => (
                  <button
                    key={dish.id}
                    className="btn btn-ghost"
                    onClick={() => swapDish(dish)}
                    style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 14px' }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{dish.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        {MEAT_LABELS[dish.meat_type]} · {dish.difficulty === 'easy' ? 'Легко' : dish.difficulty === 'medium' ? 'Средне' : 'Сложно'}
                        {dish.cooking_time ? ` · ${dish.cooking_time} мин` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
