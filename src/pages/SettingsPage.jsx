import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DAY_FULL  = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
const ALL_DAYS  = [0, 1, 2, 3, 4, 5, 6]

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
  const [activeDays, setActiveDays] = useState(ALL_DAYS)
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(true)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    const { data } = await supabase
      .from('user_settings')
      .select('active_days')
      .eq('user_id', user.id)
      .single()
    if (data?.active_days) setActiveDays(data.active_days)
    setLoading(false)
  }

  const toggleDay = async (day) => {
    const isActive = activeDays.includes(day)
    // Не разрешаем отключить последний активный день
    if (isActive && activeDays.length <= 1) return

    const newDays = isActive
      ? activeDays.filter(d => d !== day)
      : [...activeDays, day].sort((a, b) => a - b)

    setActiveDays(newDays)
    setSaving(true)
    await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, active_days: newDays, updated_at: new Date().toISOString() })
    setSaving(false)
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
        {saving && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Сохраняем...
          </span>
        )}
      </div>

      {/* Выйти */}
      <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 24, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={signOut}>
          Выйти из аккаунта
        </button>
      </div>
    </div>
  )
}
