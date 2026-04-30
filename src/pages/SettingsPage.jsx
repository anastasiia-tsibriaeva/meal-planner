import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [pantryItems, setPantryItems] = useState([])
  const [newItem, setNewItem] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const { data } = await supabase
      .from('user_settings')
      .select('pantry_items')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setPantryItems(data.pantry_items || [])
    } else {
      // Create default settings if not exist
      await supabase.from('user_settings').insert({
        user_id: user.id,
        pantry_items: ['соль', 'чёрный перец', 'перец молотый']
      })
      setPantryItems(['соль', 'чёрный перец', 'перец молотый'])
    }
    setLoading(false)
  }

  const addItem = () => {
    const trimmed = newItem.trim().toLowerCase()
    if (!trimmed || pantryItems.includes(trimmed)) {
      setNewItem('')
      return
    }
    setPantryItems(prev => [...prev, trimmed])
    setNewItem('')
  }

  const removeItem = (item) => {
    setPantryItems(prev => prev.filter(i => i !== item))
  }

  const saveSettings = async () => {
    setSaving(true)
    await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, pantry_items: pantryItems })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const exportData = async () => {
    setExportLoading(true)
    try {
      const { data: dishes } = await supabase
        .from('dishes')
        .select('*, ingredients(*)')
        .eq('user_id', user.id)

      const exportObj = {
        exportDate: new Date().toISOString(),
        dishes: dishes || [],
        pantryItems,
      }

      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `menu-planner-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  if (loading) return (
    <div className="page-container">
      <div className="spinner" style={{ marginTop: 60 }} />
    </div>
  )

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Настройки</h2>
      </div>

      {/* Pantry items */}
      <div className="settings-section">
        <div className="settings-section-title">🧂 Всегда есть дома</div>
        <p className="text-sm text-secondary" style={{ marginBottom: 16 }}>
          Эти продукты не попадают в список покупок — они всегда есть у тебя дома.
        </p>

        <div className="pantry-tags">
          {pantryItems.map(item => (
            <span key={item} className="pantry-tag">
              {item}
              <button className="pantry-tag-remove" onClick={() => removeItem(item)} title="Удалить">×</button>
            </span>
          ))}
          {pantryItems.length === 0 && (
            <span className="text-sm text-secondary">Список пуст</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Добавить продукт..."
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-secondary" onClick={addItem}>Добавить</button>
        </div>

        <button
          className="btn btn-primary"
          onClick={saveSettings}
          disabled={saving}
        >
          {saving ? 'Сохраняем...' : saved ? '✓ Сохранено' : 'Сохранить'}
        </button>
      </div>

      <hr className="divider" />

      {/* Export */}
      <div className="settings-section">
        <div className="settings-section-title">📦 Экспорт данных</div>
        <p className="text-sm text-secondary" style={{ marginBottom: 16 }}>
          Скачай все свои блюда и настройки в виде файла — для резервной копии.
        </p>
        <button className="btn btn-ghost" onClick={exportData} disabled={exportLoading}>
          {exportLoading ? 'Готовим файл...' : '⬇ Скачать данные (JSON)'}
        </button>
      </div>

      <hr className="divider" />

      {/* Account */}
      <div className="settings-section">
        <div className="settings-section-title">👤 Аккаунт</div>
        <p className="text-sm text-secondary" style={{ marginBottom: 16 }}>
          Вы вошли как: <strong>{user?.email}</strong>
        </p>
        <button className="btn btn-danger" onClick={handleSignOut}>
          Выйти из аккаунта
        </button>
      </div>
    </div>
  )
}
