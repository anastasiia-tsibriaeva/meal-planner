import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DAY_FULL  = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
const ALL_DAYS  = [0, 1, 2, 3, 4, 5, 6]

// Должно совпадать с HARD_DISHES_OPTIONS в planner/menu.py
const HARD_DISHES_OPTIONS = [
  { key: '1-2', label: '1–2' },
  { key: '3-5', label: '3–5' },
  { key: 'any', label: 'Сколько угодно' },
]
const DEFAULT_HARD_DISHES = '1-2'

function getHintText(activeDays) {
  const offDays = ALL_DAYS.filter(d => !activeDays.includes(d))
  if (offDays.length === 0) return 'Все дни активны — меню генерируется на всю неделю.'

  const names = offDays.map(d => DAY_FULL[d])
  const namesStr = names.length === 1
    ? names[0]
    : names.slice(0, -1).join(', ') + ' и ' + names[names.length - 1]

  if (names.length === 1) {
    return `${namesStr} не будет заполняться блюдами при генерации, но останется в меню как пустой день — можно добавить что-то вручную.`
  }
  return `${namesStr} не будут заполняться блюдами при генерации, но останутся в меню как пустые дни — можно добавить что-то вручную.`
}

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const [savedDays, setSavedDays]   = useState(ALL_DAYS)   // как сейчас сохранено в базе
  const [activeDays, setActiveDays] = useState(ALL_DAYS)   // что выбрано на экране
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(true)
  const [saveError, setSaveError]   = useState('')
  const [justSaved, setJustSaved]   = useState(false)
  const [savedHard, setSavedHard]   = useState(DEFAULT_HARD_DISHES)
  const [hardDishes, setHardDishes] = useState(DEFAULT_HARD_DISHES)

  const hasChanges = activeDays.join(',') !== savedDays.join(',') || hardDishes !== savedHard

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')  // все колонки: если какой-то ещё нет в базе, остальные всё равно загрузятся
      .eq('user_id', user.id)
      .single()

    // PGRST116 = no rows found (первый вход, строки ещё нет) — это нормально
    if (error && error.code !== 'PGRST116') {
      console.error('loadSettings error:', error)
    }
    if (data?.active_days) {
      const days = [...data.active_days].sort((a, b) => a - b)
      setSavedDays(days)
      setActiveDays(days)
    }
    if (data?.hard_dishes_per_week) {
      setSavedHard(data.hard_dishes_per_week)
      setHardDishes(data.hard_dishes_per_week)
    }
    setLoading(false)
  }

  const toggleDay = (day) => {
    const isActive = activeDays.includes(day)
    // Не разрешаем отключить последний активный день
    if (isActive && activeDays.length <= 1) return

    setActiveDays(isActive
      ? activeDays.filter(d => d !== day)
      : [...activeDays, day].sort((a, b) => a - b))
    setSaveError('')
    setJustSaved(false)
  }

  const saveDays = async () => {
    setSaveError('')
    setSaving(true)

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          active_days: activeDays,
          hard_dishes_per_week: hardDishes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    setSaving(false)
    if (error) {
      console.error('saveDays error:', error)
      setSaveError(error.message?.includes('hard_dishes_per_week')
        ? 'Не удалось сохранить: в базе нет новой настройки. Запусти migration_column_fix.sql в Supabase.'
        : 'Не удалось сохранить. Попробуй ещё раз.')
      return
    }
    setSavedDays(activeDays)
    setSavedHard(hardDishes)
    setJustSaved(true)
  }

  if (loading) return (
    <div className="page-container">
      <div className="spinner" style={{ marginTop: 60 }} />
    </div>
  )

  return (
    <div className="page-container" style={{ maxWidth: 480 }}>
      <h2 className="page-title">Настройки</h2>

      {/* Email */}
      <div className="form-group">
        <label className="form-label">Электронная почта</label>
        <input className="form-input" value={user.email} disabled />
      </div>

      {/* Дни генерации */}
      <div className="form-group">
        <label className="form-label">Дни генерации меню</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {ALL_DAYS.map(day => {
            const active = activeDays.includes(day)
            return (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                style={{
                  width: 42, height: 42,
                  borderRadius: '50%',
                  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: active ? 'var(--color-primary-light)' : 'var(--color-bg)',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontSize: '0.8rem', fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {DAY_SHORT[day]}
              </button>
            )
          })}
        </div>
        <p className="form-hint">{getHintText(activeDays)}</p>

      </div>

      {/* Сложные блюда */}
      <div className="form-group">
        <label className="form-label">Сложных блюд в неделю</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {HARD_DISHES_OPTIONS.map(opt => {
            const active = hardDishes === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => { setHardDishes(opt.key); setSaveError(''); setJustSaved(false) }}
                aria-pressed={active}
                style={{
                  minHeight: 42, padding: '0 16px',
                  borderRadius: 999,
                  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: active ? 'var(--color-primary-light)' : 'var(--color-bg)',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontSize: '0.85rem', fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <p className="form-hint">
          Сложными считаются обеды и ужины с отметкой «Сложная». Планер постарается уложиться в выбранный
          диапазон; если сложных блюд в базе мало, поставит сколько есть.
        </p>
      </div>

      <div className="form-group">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 0 }}>
          <button className="btn btn-primary" onClick={saveDays} disabled={!hasChanges || saving}>
            {saving ? 'Сохраняем...' : 'Сохранить изменения'}
          </button>
          {hasChanges && !saving && (
            <button className="btn btn-ghost" onClick={() => { setActiveDays(savedDays); setHardDishes(savedHard); setSaveError('') }}>
              Отменить
            </button>
          )}
          {justSaved && !hasChanges && (
            <span style={{ fontSize: '0.8rem', color: '#3B6D11' }}>✓ Сохранено</span>
          )}
        </div>
        {hasChanges && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: 6 }}>
            Есть несохранённые изменения
          </span>
        )}
        {saveError && (
          <span style={{ fontSize: '0.8rem', color: '#c0392b', display: 'block', marginTop: 6 }}>
            ⚠️ {saveError}
          </span>
        )}
      </div>

      {/* Выйти — далеко внизу, чтобы не путалось с кнопкой сохранения */}
      <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 24, marginTop: 80 }}>
        <button className="btn btn-ghost" onClick={signOut}>
          Выйти из аккаунта
        </button>
      </div>
    </div>
  )
}
