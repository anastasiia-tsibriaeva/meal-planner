import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { generateMenu, getCurrentWeekStart, getWeekLabel } from '../lib/menuGenerator'

const MEAL_LABELS       = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' }
const MEAT_LABELS       = {
  poultry: 'Птица', fish: 'Рыба', seafood: 'Морепродукты',
  red_meat: 'Красное мясо', none: 'Без мяса',
}
const DIFFICULTY_LABELS = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' }
const DAY_NAMES         = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
const IS_WEEKEND        = [false, false, false, false, false, true, true]
const MEAL_ORDER        = ['breakfast', 'lunch', 'dinner']

function pluralizeMeals(n) {
  const t = n % 100, o = n % 10
  if (t >= 11 && t <= 14) return `${n} приёмов пищи`
  if (o === 1) return `${n} приём пищи`
  if (o >= 2 && o <= 4) return `${n} приёма пищи`
  return `${n} приёмов пищи`
}

/**
 * Возвращает строку коэффициента масштабирования (например «×2/3»)
 * или null, если масштаб не изменился.
 */
function formatScale(used, total) {
  if (!used || !total || used === total) return null
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b) }
  const g = gcd(used, total)
  const num = used / g, den = total / g
  return den === 1 ? `×${num}` : `×${num}/${den}`
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
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
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const [dishes, setDishes]                   = useState([])
  const [menu, setMenu]                       = useState(null)
  const [weekStart, setWeekStart]             = useState(getCurrentWeekStart())
  const [activeDays, setActiveDays]           = useState([0, 1, 2, 3, 4, 5, 6])
  const [settingsLoaded, setSettingsLoaded]   = useState(false)
  const [loading, setLoading]                 = useState(true)
  const [saving, setSaving]                   = useState(false)
  const [swapModal, setSwapModal]             = useState(null)
  const [swapSearch, setSwapSearch]           = useState('')
  const autoSaveTimer = useRef(null)

  useEffect(() => {
    loadDishes()
    loadSettings()
  }, [])

  useEffect(() => {
    if (dishes.length > 0 && settingsLoaded) loadOrGenerateMenu()
  }, [dishes, weekStart, settingsLoaded])

  const loadSettings = async () => {
    const { data } = await supabase
      .from('user_settings')
      .select('active_days')
      .eq('user_id', user.id)
      .single()
    if (data?.active_days) setActiveDays(data.active_days)
    setSettingsLoaded(true)
  }

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
        setMenu(buildMenuFromSlots(slots, weekStart, activeDays))
        setLoading(false)
        return
      }
    }

    if (dishes.length > 0) {
      const generated = generateMenu(dishes, weekStart, { activeDays })
      setMenu(generated)
      scheduleAutoSave(generated)
    }
    setLoading(false)
  }, [dishes, weekStart, user.id, activeDays])

  function buildMenuFromSlots(slots, weekStart, activeDays) {
    const menu = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i)
      return {
        dayIndex: i, dayName: DAY_NAMES[i], isWeekend: IS_WEEKEND[i],
        isActive: activeDays.includes(i),
        date: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
        breakfast: null, lunch: null, dinner: null,
      }
    })
    for (const slot of slots) {
      if (slot.day_index >= 0 && slot.day_index < 7) {
        // Блюда ставим только для активных дней — неактивные остаются пустыми
        if (activeDays.includes(slot.day_index)) {
          menu[slot.day_index][slot.meal_type] = {
            dish:         slot.dishes,
            isLeftover:   slot.is_leftover,
            servingsUsed: slot.servings_used ?? slot.dishes?.servings_count,
          }
        }
      }
    }
    return menu
  }

  const scheduleAutoSave = (menuData) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => persistMenu(menuData), 800)
  }

  const persistMenu = async (menuData) => {
    if (!menuData) return
    setSaving(true)
    const weekStartStr = weekStart.toISOString().slice(0, 10)

    await supabase
      .from('weekly_menus')
      .delete()
      .eq('user_id', user.id)
      .eq('week_start_date', weekStartStr)

    const { data: newMenu } = await supabase
      .from('weekly_menus')
      .insert({ user_id: user.id, week_start_date: weekStartStr })
      .select()
      .single()

    if (!newMenu) { setSaving(false); return }

    const slots = []
    for (const day of menuData) {
      for (const mealType of MEAL_ORDER) {
        const slot = day[mealType]
        if (slot?.dish) {
          slots.push({
            menu_id:      newMenu.id,
            day_index:    day.dayIndex,
            meal_type:    mealType,
            dish_id:      slot.dish.id,
            is_leftover:  slot.isLeftover,
            servings_used: slot.servingsUsed ?? null,
          })
        }
      }
    }
    await supabase.from('menu_slots').insert(slots)
    setSaving(false)
  }

  const regenerate = () => {
    if (dishes.length === 0) return
    const generated = generateMenu(dishes, weekStart, { activeDays })
    setMenu(generated)
    scheduleAutoSave(generated)
  }

  const openSwapModal = (dayIndex, mealType, isLeftoverSlot = false) => {
    setSwapModal({ dayIndex, mealType, isLeftoverSlot })
    setSwapSearch('')
  }

  const closeSwapModal = () => {
    setSwapModal(null)
    setSwapSearch('')
  }

  const swapDish = (newDish) => {
    if (!swapModal) return
    const { dayIndex, mealType, isLeftoverSlot } = swapModal

    setMenu(prev => {
      const originalDish = prev.find(d => d.dayIndex === dayIndex)?.[mealType]?.dish

      let updated = prev.map(day =>
        day.dayIndex === dayIndex
          ? { ...day, [mealType]: { dish: newDish, isLeftover: false, servingsUsed: newDish.servings_count } }
          : day
      )

      if (!isLeftoverSlot && originalDish) {
        updated = updated.map(day => {
          let changed = false
          const newDay = { ...day }
          for (const mt of MEAL_ORDER) {
            if (newDay[mt]?.isLeftover && newDay[mt]?.dish?.id === originalDish.id) {
              newDay[mt] = { dish: newDish, isLeftover: true, servingsUsed: newDish.servings_count }
              changed = true
            }
          }
          return changed ? newDay : day
        })
      }

      scheduleAutoSave(updated)
      return updated
    })
    closeSwapModal()
  }

  const changeWeek = (delta) => {
    const newStart = new Date(weekStart)
    newStart.setDate(newStart.getDate() + delta * 7)
    setWeekStart(newStart)
  }

  const getMeatStats = () => {
    if (!menu) return []
    const used = new Set()
    for (const day of menu) {
      for (const mealType of MEAL_ORDER) {
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
    ? dishes
        .filter(d => d.meal_types?.includes(swapModal.mealType))
        .filter(d =>
          !swapSearch.trim() ||
          d.name.toLowerCase().includes(swapSearch.trim().toLowerCase())
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {saving && (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              Сохраняем...
            </span>
          )}
          <button className="btn btn-secondary" onClick={regenerate} disabled={loading}>
            <RefreshIcon /> Сгенерировать другое меню
          </button>
        </div>
      </div>

      <div className="week-nav">
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => changeWeek(-1)}>←</button>
        <span className="week-nav-label">{getWeekLabel(weekStart)}</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => changeWeek(1)}>→</button>
      </div>

      {menu && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="text-sm text-secondary">Разнообразие мяса:</span>
          {['poultry', 'red_meat', 'fish', 'seafood'].map(type => (
            <span
              key={type}
              className="tag"
              style={{
                background: meatStats.includes(type) ? 'var(--color-primary-light)' : 'var(--color-bg)',
                color:      meatStats.includes(type) ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                border:     `1px solid ${meatStats.includes(type) ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}
            >
              {meatStats.includes(type) ? '✓' : '○'} {MEAT_LABELS[type]}
            </span>
          ))}
        </div>
      )}

      {menu && (
        <div className="menu-grid">
          {menu.map(day => (
            <div
              key={day.dayIndex}
              className="menu-day-card"
              style={!day.isActive ? { opacity: 0.55 } : undefined}
            >
              <div className="menu-day-header">
                <span className="menu-day-name">
                  {day.isWeekend ? '🌅 ' : ''}{day.dayName}
                  {!day.isActive && (
                    <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                      свободный
                    </span>
                  )}
                </span>
                <span className="menu-day-date">{day.date}</span>
              </div>

              <div className="menu-meals">
                {MEAL_ORDER.map(mealType => {
                  const slot = day[mealType]
                  return (
                    <div key={mealType} className="menu-meal">
                      <div className="menu-meal-label">{MEAL_LABELS[mealType]}</div>
                      {slot?.dish ? (
                        <>
                          <div
                            className="menu-meal-dish"
                            onClick={() => navigate(`/dishes/${slot.dish.id}`)}
                            style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'transparent' }}
                            onMouseEnter={e => e.currentTarget.style.textDecorationColor = 'currentColor'}
                            onMouseLeave={e => e.currentTarget.style.textDecorationColor = 'transparent'}
                          >
                            {slot.dish.name}
                          </div>
                          {slot.isLeftover && (
                            <div className="menu-meal-leftover">🍱 остатки</div>
                          )}
                          {!slot.isLeftover && slot.dish.servings_count > 1 && (() => {
                            const used  = slot.servingsUsed ?? slot.dish.servings_count
                            const scale = formatScale(used, slot.dish.servings_count)
                            return (
                              <div style={{ fontSize: '0.72rem', color: '#3B6D11', marginTop: 2 }}>
                                {scale
                                  ? `Готовлю на ${pluralizeMeals(used)} · ${scale} от рецепта`
                                  : `Хватит на ${pluralizeMeals(slot.dish.servings_count)}`
                                }
                              </div>
                            )
                          })()}
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
                          <button
                            className="menu-meal-change btn btn-ghost btn-sm"
                            onClick={() => openSwapModal(day.dayIndex, mealType, slot.isLeftover)}
                            title="Заменить блюдо"
                            style={{ marginTop: 4, fontSize: '0.75rem', padding: '3px 8px' }}
                          >
                            <SwapIcon /> заменить
                          </button>
                        </>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div className="menu-meal-empty">не задано</div>
                          {day.isActive && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => openSwapModal(day.dayIndex, mealType, false)}
                              style={{ fontSize: '0.72rem', padding: '2px 8px', marginTop: 2 }}
                            >
                              + добавить
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {swapModal && (
        <div className="modal-overlay" onClick={closeSwapModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {swapModal.isLeftoverSlot
                  ? `Заменить ${MEAL_LABELS[swapModal.mealType].toLowerCase()} (только этот день)`
                  : `Заменить ${MEAL_LABELS[swapModal.mealType].toLowerCase()}`}
              </span>
              <button className="btn btn-ghost btn-icon" onClick={closeSwapModal}>✕</button>
            </div>
            {!swapModal.isLeftoverSlot && (
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
                Остатки этого блюда в других днях тоже обновятся
              </p>
            )}
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Поиск по названию..."
              value={swapSearch}
              onChange={e => setSwapSearch(e.target.value)}
              autoFocus
              style={{ marginBottom: 10 }}
            />
            {swapCandidates.length === 0 ? (
              <p className="text-sm text-secondary">
                {swapSearch.trim()
                  ? 'Ничего не найдено — попробуй другой запрос'
                  : 'Нет блюд для этого типа приёма пищи'}
              </p>
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
                        {MEAT_LABELS[dish.meat_type]} · {DIFFICULTY_LABELS[dish.difficulty]}
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
