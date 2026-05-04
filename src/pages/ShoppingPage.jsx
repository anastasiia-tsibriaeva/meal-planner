import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getCurrentWeekStart, getWeekLabel } from '../lib/menuGenerator'

export default function ShoppingPage() {
  const { user }     = useAuth()
  const navigate     = useNavigate()
  const [weekStart, setWeekStart]     = useState(getCurrentWeekStart())
  const [menuItems, setMenuItems]     = useState([])
  const [customItems, setCustomItems] = useState([])
  const [loading, setLoading]         = useState(true)
  const [newText, setNewText]         = useState('')
  const [dbError, setDbError]         = useState('')
  const saveTimers = useRef({})

  const weekStartStr = weekStart.toISOString().slice(0, 10)

  useEffect(() => { loadItems() }, [weekStartStr])

  useEffect(() => {
    const channel = supabase
      .channel(`shopping-${user.id}-${weekStartStr}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const item = payload.new
            if (item.source === 'menu' && item.week_start_date === weekStartStr) {
              setMenuItems(prev => addOrReplace(prev, item))
            } else if (item.source === 'custom') {
              setCustomItems(prev => addOrReplace(prev, item))
            }
          } else if (payload.eventType === 'UPDATE') {
            const item = payload.new
            if (item.source === 'menu') {
              setMenuItems(prev => prev.map(i => i.id === item.id ? item : i))
            } else {
              setCustomItems(prev => prev.map(i => i.id === item.id ? item : i))
            }
          } else if (payload.eventType === 'DELETE') {
            const id = payload.old?.id
            if (id) {
              setMenuItems(prev => prev.filter(i => i.id !== id))
              setCustomItems(prev => prev.filter(i => i.id !== id))
            }
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user.id, weekStartStr])

  function addOrReplace(list, item) {
    const exists = list.find(i => i.id === item.id)
    if (exists) return list.map(i => i.id === item.id ? item : i)
    return [...list, item].sort((a, b) => a.sort_order - b.sort_order)
  }

  const loadItems = async () => {
    setLoading(true)
    setDbError('')

    const { data: mItems, error: mErr } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('source', 'menu')
      .eq('week_start_date', weekStartStr)
      .order('sort_order')

    const { data: cItems, error: cErr } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('source', 'custom')
      .is('week_start_date', null)
      .order('sort_order')

    if (mErr || cErr) {
      const err = mErr || cErr
      console.error('loadItems error:', err)
      setDbError(
        err.code === '42P01'
          ? 'Таблица shopping_items не найдена. Запусти migration_column_fix.sql в Supabase SQL Editor.'
          : `Ошибка загрузки: ${err.message}`
      )
      setLoading(false)
      return
    }

    setCustomItems(cItems || [])

    if (mItems && mItems.length > 0) {
      setMenuItems(mItems)
    } else {
      await populateFromMenu()
    }

    setLoading(false)
  }

  const populateFromMenu = async () => {
    const { data: weekMenu } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStartStr)
      .single()

    if (!weekMenu) return

    const { data: slots } = await supabase
      .from('menu_slots')
      .select('*, dishes(*, ingredients(*))')
      .eq('menu_id', weekMenu.id)
      .eq('is_leftover', false)

    if (!slots || slots.length === 0) return

    // Собираем ингредиенты с учётом масштабирования порций
    const seen = new Map()
    for (const slot of slots) {
      const servingsUsed  = slot.servings_used ?? slot.dishes?.servings_count ?? 1
      const servingsCount = slot.dishes?.servings_count ?? 1
      const scale = servingsCount > 0 ? servingsUsed / servingsCount : 1

      for (const ing of slot.dishes?.ingredients || []) {
        const key = ing.name.toLowerCase().trim()
        if (!seen.has(key)) {
          const parts = [ing.name]
          if (ing.quantity) {
            // Масштабируем количество, округляем до целого
            const scaledQty = Math.round(ing.quantity * scale)
            parts.push(String(scaledQty))
          }
          if (ing.unit) parts.push(ing.unit)
          seen.set(key, parts.join(' ').trim())
        }
      }
    }

    if (seen.size === 0) return

    const toInsert = Array.from(seen.values()).map((text, i) => ({
      user_id:         user.id,
      text,
      checked:         false,
      sort_order:      i,
      source:          'menu',
      week_start_date: weekStartStr,
    }))

    const { data: inserted, error: insertErr } = await supabase
      .from('shopping_items')
      .insert(toInsert)
      .select()

    if (insertErr) {
      console.error('populateFromMenu insert error:', insertErr)
      if (insertErr.code === '42P01') {
        setDbError('Таблица shopping_items не найдена. Запусти migration_column_fix.sql в Supabase SQL Editor.')
      }
      return
    }

    setMenuItems((inserted || []).sort((a, b) => a.sort_order - b.sort_order))
  }

  const saveText = useCallback((id, text) => {
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = setTimeout(async () => {
      await supabase.from('shopping_items').update({ text }).eq('id', id)
    }, 600)
  }, [])

  const updateText = (id, text, source) => {
    if (source === 'menu') {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, text } : i))
    } else {
      setCustomItems(prev => prev.map(i => i.id === id ? { ...i, text } : i))
    }
    saveText(id, text)
  }

  const toggleChecked = async (id, source) => {
    const list = source === 'menu' ? menuItems : customItems
    const item = list.find(i => i.id === id)
    if (!item) return
    const newChecked = !item.checked
    if (source === 'menu') {
      setMenuItems(prev => prev.map(i => i.id === id ? { ...i, checked: newChecked } : i))
    } else {
      setCustomItems(prev => prev.map(i => i.id === id ? { ...i, checked: newChecked } : i))
    }
    await supabase.from('shopping_items').update({ checked: newChecked }).eq('id', id)
  }

  const addCustomItem = async () => {
    const text = newText.trim()
    if (!text) return

    setNewText('')  // очищаем сразу для быстрого UX

    const maxOrder = customItems.reduce((m, i) => Math.max(m, i.sort_order), -1)
    const { data, error } = await supabase
      .from('shopping_items')
      .insert({
        user_id: user.id,
        text,
        checked: false,
        sort_order: maxOrder + 1,
        source: 'custom',
        week_start_date: null,
      })
      .select()
      .single()

    if (error) {
      console.error('addCustomItem error:', error)
      setNewText(text)  // возвращаем текст если не сохранилось
      if (error.code === '42P01') {
        setDbError('Таблица shopping_items не найдена. Запусти migration_column_fix.sql в Supabase SQL Editor.')
      }
      return
    }

    if (data) setCustomItems(prev => [...prev, data])
  }

  const deleteChecked = async () => {
    const checkedIds = [
      ...menuItems.filter(i => i.checked).map(i => i.id),
      ...customItems.filter(i => i.checked).map(i => i.id),
    ]
    if (checkedIds.length === 0) return
    setMenuItems(prev => prev.filter(i => !i.checked))
    setCustomItems(prev => prev.filter(i => !i.checked))
    await supabase.from('shopping_items').delete().in('id', checkedIds)
  }

  const changeWeek = (delta) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + delta * 7)
    setWeekStart(d)
  }

  const hasChecked = menuItems.some(i => i.checked) || customItems.some(i => i.checked)

  const itemStyle = (checked) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 0',
    borderBottom: '0.5px solid var(--color-border)',
    opacity: checked ? 0.55 : 1,
  })

  const inputStyle = (checked) => ({
    flex: 1, border: 'none', background: 'transparent', outline: 'none',
    fontSize: '0.9rem', fontFamily: 'inherit', padding: 0,
    color: 'var(--color-text-primary)',
    textDecoration: checked ? 'line-through' : 'none',
  })

  const Checkbox = ({ checked, onChange }) => (
    <div
      onClick={onChange}
      style={{
        width: 16, height: 16, flexShrink: 0, borderRadius: 3, cursor: 'pointer',
        border: checked ? 'none' : '1.5px solid var(--color-border)',
        background: checked ? '#3B6D11' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <polyline points="2,5 4.5,8 8,2" stroke="white" strokeWidth="1.5" fill="none"/>
        </svg>
      )}
    </div>
  )

  if (loading) return (
    <div className="page-container">
      <div className="spinner" style={{ marginTop: 60 }} />
    </div>
  )

  return (
    <div className="page-container" style={{ maxWidth: 540 }}>
      <div className="page-header">
        <h2 className="page-title">Список покупок</h2>
      </div>

      <div className="week-nav" style={{ marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => changeWeek(-1)}>←</button>
        <span className="week-nav-label">{getWeekLabel(weekStart)}</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => changeWeek(1)}>→</button>
      </div>

      {dbError && (
        <div style={{
          background: '#FFF3F3', border: '1px solid #F5AAAA', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#8B0000',
        }}>
          ⚠️ {dbError}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 8,
        }}>
          Из меню
        </div>

        {menuItems.length === 0 ? (
          <div style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', padding: '8px 0' }}>
            Меню на эту неделю ещё не создано.{' '}
            <span
              style={{ color: 'var(--color-primary)', cursor: 'pointer' }}
              onClick={() => navigate('/menu')}
            >
              Сгенерировать →
            </span>
          </div>
        ) : (
          menuItems.map(item => (
            <div key={item.id} style={itemStyle(item.checked)}>
              <Checkbox checked={item.checked} onChange={() => toggleChecked(item.id, 'menu')} />
              <input
                style={inputStyle(item.checked)}
                value={item.text}
                onChange={e => updateText(item.id, e.target.value, 'menu')}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                из меню
              </span>
            </div>
          ))
        )}
      </div>

      <div style={{
        fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 8,
      }}>
        Своё
      </div>

      {customItems.map(item => (
        <div key={item.id} style={itemStyle(item.checked)}>
          <Checkbox checked={item.checked} onChange={() => toggleChecked(item.id, 'custom')} />
          <input
            style={inputStyle(item.checked)}
            value={item.text}
            onChange={e => updateText(item.id, e.target.value, 'custom')}
          />
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
        <div style={{
          width: 16, height: 16, flexShrink: 0, borderRadius: 3,
          border: '1.5px dashed var(--color-border)',
        }} />
        <input
          style={{ ...inputStyle(false), color: 'var(--color-text-secondary)' }}
          placeholder="Добавить..."
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addCustomItem() }}
        />
        {newText.trim() && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={addCustomItem}
            style={{ fontSize: '0.78rem', padding: '2px 10px', flexShrink: 0 }}
          >
            ↵ добавить
          </button>
        )}
      </div>

      {hasChecked && (
        <div style={{ marginTop: 20 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={deleteChecked}
            style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}
          >
            Удалить купленное
          </button>
        </div>
      )}
    </div>
  )
}
