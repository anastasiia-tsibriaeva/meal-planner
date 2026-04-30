import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const MEAL_TYPES = [
  { key: 'breakfast', label: '☀️ Завтрак' },
  { key: 'lunch', label: '🥗 Обед' },
  { key: 'dinner', label: '🍽️ Ужин' },
]

const MEAT_TYPES = [
  { key: 'poultry', label: '🐔 Птица' },
  { key: 'red_meat', label: '🥩 Красное мясо' },
  { key: 'fish', label: '🐟 Рыба' },
  { key: 'seafood', label: '🦐 Морепродукты' },
  { key: 'none', label: '🥦 Без мяса' },
]

const DIFFICULTY_OPTIONS = [
  { key: 'easy', label: '✅ Легко' },
  { key: 'medium', label: '🟡 Средне' },
  { key: 'hard', label: '🔴 Сложно' },
]

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
    </svg>
  )
}

const emptyIngredient = () => ({ id: crypto.randomUUID(), name: '', quantity: '', unit: '' })

export default function DishFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [form, setForm] = useState({
    name: '',
    meal_types: [],
    meat_type: 'poultry',
    difficulty: 'easy',
    cooking_time: '',
    servings_count: '1',
    recipe_text: '',
    recipe_link: '',
  })
  const [ingredients, setIngredients] = useState([emptyIngredient()])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isEdit) loadDish()
  }, [id])

  const loadDish = async () => {
    const { data } = await supabase
      .from('dishes')
      .select('*, ingredients(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!data) { navigate('/dishes'); return }

    setForm({
      name: data.name,
      meal_types: data.meal_types,
      meat_type: data.meat_type,
      difficulty: data.difficulty,
      cooking_time: data.cooking_time ?? '',
      servings_count: String(data.servings_count),
      recipe_text: data.recipe_text ?? '',
      recipe_link: data.recipe_link ?? '',
    })

    const ings = data.ingredients?.length > 0
      ? data.ingredients.map(i => ({ id: i.id, name: i.name, quantity: i.quantity ?? '', unit: i.unit ?? '' }))
      : [emptyIngredient()]
    setIngredients(ings)
    setLoading(false)
  }

  const toggleMealType = (type) => {
    setForm(f => ({
      ...f,
      meal_types: f.meal_types.includes(type)
        ? f.meal_types.filter(t => t !== type)
        : [...f.meal_types, type]
    }))
  }

  const updateIngredient = (idx, field, value) => {
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing))
  }

  const addIngredient = () => setIngredients(prev => [...prev, emptyIngredient()])

  const removeIngredient = (idx) => {
    if (ingredients.length === 1) return
    setIngredients(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) { setError('Введи название блюда.'); return }
    if (form.meal_types.length === 0) { setError('Выбери хотя бы один тип приёма пищи.'); return }

    setSaving(true)

    const dishData = {
      user_id: user.id,
      name: form.name.trim(),
      meal_types: form.meal_types,
      meat_type: form.meat_type,
      difficulty: form.difficulty,
      cooking_time: form.cooking_time ? parseInt(form.cooking_time) : null,
      servings_count: parseInt(form.servings_count) || 1,
      recipe_text: form.recipe_text.trim() || null,
      recipe_link: form.recipe_link.trim() || null,
      updated_at: new Date().toISOString(),
    }

    let dishId = id

    if (isEdit) {
      const { error: err } = await supabase.from('dishes').update(dishData).eq('id', id)
      if (err) { setError('Ошибка при сохранении.'); setSaving(false); return }
      // Delete old ingredients
      await supabase.from('ingredients').delete().eq('dish_id', id)
    } else {
      const { data, error: err } = await supabase.from('dishes').insert(dishData).select().single()
      if (err || !data) { setError('Ошибка при создании блюда.'); setSaving(false); return }
      dishId = data.id
    }

    // Insert ingredients
    const validIngredients = ingredients
      .filter(ing => ing.name.trim())
      .map((ing, idx) => ({
        dish_id: dishId,
        name: ing.name.trim(),
        quantity: ing.quantity ? parseFloat(ing.quantity) : null,
        unit: ing.unit.trim() || null,
        sort_order: idx,
      }))

    if (validIngredients.length > 0) {
      await supabase.from('ingredients').insert(validIngredients)
    }

    navigate('/dishes')
  }

  if (loading) return <div className="page-container"><div className="spinner" style={{ marginTop: 60 }} /></div>

  return (
    <div className="page-container" style={{ maxWidth: 700 }}>
      <div className="page-header">
        <h2 className="page-title">{isEdit ? 'Редактировать блюдо' : 'Новое блюдо'}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}

        {/* Name */}
        <div className="form-group">
          <label className="form-label">Название блюда *</label>
          <input
            type="text"
            className="form-input"
            placeholder="Например: Паста карбонара"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            autoFocus={!isEdit}
          />
        </div>

        {/* Meal types */}
        <div className="form-group">
          <label className="form-label">Тип приёма пищи *</label>
          <div className="checkbox-group">
            {MEAL_TYPES.map(({ key, label }) => (
              <label key={key} className={`checkbox-chip${form.meal_types.includes(key) ? ' checked' : ''}`}>
                <input type="checkbox" checked={form.meal_types.includes(key)} onChange={() => toggleMealType(key)} />
                {label}
              </label>
            ))}
          </div>
          <span className="form-hint">Можно выбрать несколько</span>
        </div>

        {/* Meat type */}
        <div className="form-group">
          <label className="form-label">Тип мяса</label>
          <div className="checkbox-group">
            {MEAT_TYPES.map(({ key, label }) => (
              <label key={key} className={`checkbox-chip${form.meat_type === key ? ' checked' : ''}`}>
                <input type="radio" name="meat_type" checked={form.meat_type === key} onChange={() => setForm(f => ({ ...f, meat_type: key }))} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Difficulty & time */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Сложность</label>
            <select className="form-select" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
              {DIFFICULTY_OPTIONS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Время (мин)</label>
            <input
              type="number"
              className="form-input"
              placeholder="30"
              min="1"
              max="600"
              value={form.cooking_time}
              onChange={e => setForm(f => ({ ...f, cooking_time: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Кол-во порций</label>
            <input
              type="number"
              className="form-input"
              min="1"
              max="10"
              value={form.servings_count}
              onChange={e => setForm(f => ({ ...f, servings_count: e.target.value }))}
            />
            <span className="form-hint">На сколько приёмов хватит</span>
          </div>
        </div>

        {/* Ingredients */}
        <div className="form-group">
          <label className="form-label">Ингредиенты</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 36px', gap: 6, marginBottom: 6 }}>
            <span className="form-hint">Название</span>
            <span className="form-hint">Кол-во</span>
            <span className="form-hint">Единица</span>
            <span />
          </div>
          <div className="ingredients-list">
            {ingredients.map((ing, idx) => (
              <div key={ing.id} className="ingredient-row">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Лосось"
                  value={ing.name}
                  onChange={e => updateIngredient(idx, 'name', e.target.value)}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="200"
                  value={ing.quantity}
                  onChange={e => updateIngredient(idx, 'quantity', e.target.value)}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="г / шт / мл"
                  value={ing.unit}
                  onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-danger btn-icon btn-sm"
                  onClick={() => removeIngredient(idx)}
                  disabled={ingredients.length === 1}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addIngredient}>
            <PlusIcon /> Добавить ингредиент
          </button>
        </div>

        {/* Recipe */}
        <div className="form-group">
          <label className="form-label">Рецепт</label>
          <textarea
            className="form-textarea"
            placeholder="Шаги приготовления..."
            value={form.recipe_text}
            onChange={e => setForm(f => ({ ...f, recipe_text: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Ссылка на рецепт (Reels и т.д.)</label>
          <input
            type="url"
            className="form-input"
            placeholder="https://www.instagram.com/reel/..."
            value={form.recipe_link}
            onChange={e => setForm(f => ({ ...f, recipe_link: e.target.value }))}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? 'Сохраняем...' : isEdit ? 'Сохранить изменения' : 'Добавить блюдо'}
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => navigate('/dishes')}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  )
}
