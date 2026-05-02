import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const MEAL_TYPE_LABELS = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' }
const MEAT_TYPE_LABELS = {
  poultry: 'Птица', fish: 'Рыба', seafood: 'Морепродукты',
  red_meat: 'Красное мясо', none: 'Без мяса'
}
const DIFFICULTY_LABELS = { easy: 'Легко', medium: 'Средне', hard: 'Сложно' }

function pluralizeMeals(n) {
  const lastTwo = n % 100
  const lastOne = n % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${n} приёмов пищи`
  if (lastOne === 1) return `${n} приём пищи`
  if (lastOne >= 2 && lastOne <= 4) return `${n} приёма пищи`
  return `${n} приёмов пищи`
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}

export default function DishesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [dishes, setDishes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => { loadDishes() }, [])

  const loadDishes = async () => {
    const { data } = await supabase
      .from('dishes')
      .select('*, ingredients(id, name, quantity, unit)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setDishes(data || [])
    setLoading(false)
  }

  const deleteDish = async (id) => {
    if (!confirm('Удалить это блюдо?')) return
    setDeletingId(id)
    await supabase.from('dishes').delete().eq('id', id)
    setDishes(prev => prev.filter(d => d.id !== id))
    setDeletingId(null)
  }

  const filtered = dishes.filter(d => {
    if (filter !== 'all' && !d.meal_types.includes(filter)) return false
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Мои блюда</h2>
        <button className="btn btn-primary" onClick={() => navigate('/dishes/new')}>
          <PlusIcon /> Добавить блюдо
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        className="form-input"
        placeholder="🔍 Поиск по названию..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {/* Filters */}
      <div className="filters-row">
        {[
          { key: 'all', label: 'Все' },
          { key: 'breakfast', label: '☀️ Завтрак' },
          { key: 'lunch', label: '🥗 Обед' },
          { key: 'dinner', label: '🍽️ Ужин' },
        ].map(f => (
          <button
            key={f.key}
            className={`filter-chip${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spinner" style={{ marginTop: 60 }} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="icon">{dishes.length === 0 ? '📖' : '🔍'}</span>
          <h3>{dishes.length === 0 ? 'Блюд пока нет' : 'Ничего не найдено'}</h3>
          <p>{dishes.length === 0
            ? 'Добавь первое блюдо, чтобы начать планировать меню'
            : 'Попробуй изменить поиск или фильтр'
          }</p>
          {dishes.length === 0 && (
            <button className="btn btn-primary" onClick={() => navigate('/dishes/new')}>
              <PlusIcon /> Добавить первое блюдо
            </button>
          )}
        </div>
      ) : (
        <div className="dishes-grid">
          {filtered.map(dish => (
            <div key={dish.id} className="dish-card">
              <div className="dish-card-name">{dish.name}</div>

              {/* Meal type chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {dish.meal_types.map(mt => (
                  <span key={mt} style={{
                    background: '#E6F1FB', color: '#185FA5',
                    border: '0.5px solid rgba(133,183,235,0.5)',
                    borderRadius: 20, fontSize: '0.76rem', padding: '2px 9px'
                  }}>{MEAL_TYPE_LABELS[mt]}</span>
                ))}
              </div>

              {/* Divider */}
              <div style={{ borderTop: '0.5px solid var(--color-border)', margin: '6px 0 8px' }} />

              {/* Info table */}
              <table style={{ width: '100%', fontSize: '0.78rem', borderSpacing: 0, marginBottom: 8 }}>
                <tbody>
                  <tr>
                    <td style={{ color: 'var(--color-text-secondary)', padding: '2px 0', width: '42%' }}>Мясо</td>
                    <td style={{ color: 'var(--color-text)', padding: '2px 0' }}>{MEAT_TYPE_LABELS[dish.meat_type] || dish.meat_type}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--color-text-secondary)', padding: '2px 0' }}>Сложность</td>
                    <td style={{ color: 'var(--color-text)', padding: '2px 0' }}>
                      {DIFFICULTY_LABELS[dish.difficulty]}{dish.cooking_time ? ` · ${dish.cooking_time} мин` : ''}
                    </td>
                  </tr>
                  {dish.servings_count > 1 && (
                    <tr>
                      <td style={{ color: 'var(--color-text-secondary)', padding: '2px 0' }}>Приёмов пищи</td>
                      <td style={{ color: '#3B6D11', fontWeight: 500, padding: '2px 0' }}>{pluralizeMeals(dish.servings_count)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {dish.ingredients?.length > 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>
                  {dish.ingredients.slice(0, 4).map(ing => ing.name).join(', ')}
                  {dish.ingredients.length > 4 && ` +ещё ${dish.ingredients.length - 4}`}
                </div>
              )}

              {dish.recipe_link && (
                <a
                  href={dish.recipe_link}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.82rem', color: 'var(--color-primary)', fontWeight: 500 }}
                >
                  🎬 Рецепт
                </a>
              )}

              <div className="dish-card-footer">
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => navigate(`/dishes/${dish.id}/edit`)}
                  title="Редактировать"
                >
                  <EditIcon />
                </button>
                <button
                  className="btn btn-danger btn-sm btn-icon"
                  onClick={() => deleteDish(dish.id)}
                  disabled={deletingId === dish.id}
                  title="Удалить"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
        {!loading && `${filtered.length} из ${dishes.length} блюд`}
      </div>
    </div>
  )
}
