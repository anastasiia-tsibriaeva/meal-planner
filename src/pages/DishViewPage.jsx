import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const MEAL_TYPE_LABELS = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' }
const MEAT_TYPE_LABELS = {
  poultry: 'Птица', fish: 'Рыба', seafood: 'Морепродукты',
  red_meat: 'Красное мясо', none: 'Без мяса'
}
const DIFFICULTY_LABELS = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' }

function pluralizeMeals(n) {
  const lastTwo = n % 100
  const lastOne = n % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${n} приёмов пищи`
  if (lastOne === 1) return `${n} приём пищи`
  if (lastOne >= 2 && lastOne <= 4) return `${n} приёма пищи`
  return `${n} приёмов пищи`
}

export default function DishViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [dish, setDish] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDish() }, [id])

  const loadDish = async () => {
    const { data } = await supabase
      .from('dishes')
      .select('*, ingredients(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!data) { navigate('/dishes'); return }

    const sorted = data.ingredients
      ? [...data.ingredients].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      : []
    setDish({ ...data, ingredients: sorted })
    setLoading(false)
  }

  if (loading) return (
    <div className="page-container">
      <div className="spinner" style={{ marginTop: 60 }} />
    </div>
  )

  if (!dish) return null

  return (
    <div className="page-container" style={{ maxWidth: 640 }}>

      {/* Header — only back button */}
      <div style={{ marginBottom: 20 }}>
        <button
          className="btn btn-ghost"
          onClick={() => navigate('/dishes')}
          style={{ padding: '6px 10px', fontSize: '0.9rem' }}
        >
          ← Назад
        </button>
      </div>

      {/* Dish name */}
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 14px' }}>
        {dish.name}
      </h2>

      {/* Meal type chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
        {dish.meal_types.map(mt => (
          <span
            key={mt}
            style={{
              background: '#E6F1FB',
              color: '#185FA5',
              border: '0.5px solid rgba(133,183,235,0.5)',
              borderRadius: 20,
              fontSize: '0.8rem',
              padding: '3px 11px',
            }}
          >
            {MEAL_TYPE_LABELS[mt]}
          </span>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '0.5px solid var(--color-border)', marginBottom: 16 }} />

      {/* Info table */}
      <table style={{ width: '100%', fontSize: '0.88rem', borderSpacing: 0, marginBottom: 20 }}>
        <tbody>
          <tr>
            <td style={{ color: 'var(--color-text-secondary)', padding: '5px 0', width: '38%' }}>Тип мяса</td>
            <td style={{ padding: '5px 0', fontWeight: 500 }}>{MEAT_TYPE_LABELS[dish.meat_type]}</td>
          </tr>
          <tr>
            <td style={{ color: 'var(--color-text-secondary)', padding: '5px 0' }}>Сложность</td>
            <td style={{ padding: '5px 0' }}>
              {DIFFICULTY_LABELS[dish.difficulty]}
              {dish.cooking_time ? ` · ${dish.cooking_time} мин` : ''}
            </td>
          </tr>
          {dish.servings_count > 1 && (
            <tr>
              <td style={{ color: 'var(--color-text-secondary)', padding: '5px 0' }}>Приёмов пищи</td>
              <td style={{ padding: '5px 0', color: '#3B6D11', fontWeight: 500 }}>
                {pluralizeMeals(dish.servings_count)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Ingredients */}
      {dish.ingredients?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}>
            Ингредиенты (на всё блюдо целиком)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {dish.ingredients.map(ing => (
              <div
                key={ing.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.88rem',
                  padding: '5px 0',
                  borderBottom: '0.5px solid var(--color-border)',
                }}
              >
                <span>{ing.name}</span>
                {(ing.quantity || ing.unit) && (
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {ing.quantity ? ing.quantity : ''}{ing.unit ? ` ${ing.unit}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recipe text */}
      {dish.recipe_text && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}>
            Рецепт
          </div>
          <p style={{
            fontSize: '0.88rem',
            lineHeight: 1.7,
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}>
            {dish.recipe_text}
          </p>
        </div>
      )}

      {/* Recipe link */}
      {dish.recipe_link && (
        <div style={{ marginBottom: 28 }}>
          <a
            href={dish.recipe_link}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.9rem', color: 'var(--color-primary)', fontWeight: 500 }}
          >
            🎬 Смотреть рецепт
          </a>
        </div>
      )}

      {/* Bottom buttons */}
      <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 20, display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" onClick={() => navigate(`/dishes/${id}/edit`)}>
          Редактировать блюдо
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/dishes')}>
          Назад к списку
        </button>
      </div>
    </div>
  )
}
