import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getCurrentWeekStart, getWeekLabel, toDateKey } from '../lib/dates'
import { syncMenuShoppingItems } from '../lib/shoppingSync'

export default function ShoppingPage() {
  const { user }     = useAuth()
  const navigate     = useNavigate()
  const [weekStart, setWeekStart]     = useState(getCurrentWeekStart())
  const [menuItems, setMenuItems]     = useState([])
  const [customItems, setCustomItems] = useState([])
  const [loading, setLoading]         = useState(true)
  const [newText, setNewText]         = useState('')
  const [dbError, setDbError]         = useState('')
  const [menuStatus, setMenuStatus]   = useState('none') // 'none' — меню нет, 'empty' — в меню нет продуктов
  const saveTimers = useRef({})
  const loadState  = useRef({ running: false, again: false, populate: false })
  const pendingEdits = useRef(new Set())  // пункты, текст которых ещё сохраняется
  const reloadTimer  = useRef(null)

  const weekStartStr = toDateKey(weekStart)
  const weekRef = useRef(weekStartStr)
  weekRef.current = weekStartStr

  useEffect(() => { loadItems() }, [weekStartStr])

  // Подтягиваем свежие данные, когда вкладка/телефон снова активны:
  // пока устройство спало, изменения с другого устройства могли не дойти.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') loadItems({ silent: true }) }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [weekStartStr])

  useEffect(() => {
    const channel = supabase
      .channel(`shopping-${user.id}-${weekStartStr}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items', filter: `user_id=eq.${user.id}` },
        (payload) => {
          // Применяем изменение сразу (чтобы было мгновенно), а затем перечитываем
          // список из базы — так запоздавший ответ на старый запрос не затрёт свежие данные.
          scheduleReload()
          if (payload.eventType === 'INSERT') {
            const item = payload.new
            if (item.source === 'menu' && item.week_start_date === weekStartStr) {
              setMenuItems(prev => addOrReplace(prev, item))
            } else if (item.source === 'custom') {
              setCustomItems(prev => addOrReplace(prev, item))
            }
          } else if (payload.eventType === 'UPDATE') {
            const item = { ...payload.new }
            if (pendingEdits.current.has(item.id)) delete item.text  // не перебиваем то, что сейчас печатают
            if (item.source === 'menu') {
              setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, ...item } : i))
            } else {
              setCustomItems(prev => prev.map(i => i.id === item.id ? { ...i, ...item } : i))
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
      .subscribe((status) => {
        // Подписка заработала — перечитываем, чтобы не потерять изменения, сделанные до неё
        if (status === 'SUBSCRIBED') loadItems({ silent: true })
      })

    return () => { supabase.removeChannel(channel); clearTimeout(reloadTimer.current) }
  }, [user.id, weekStartStr])

  function addOrReplace(list, item) {
    const exists = list.find(i => i.id === item.id)
    if (exists) return list.map(i => i.id === item.id ? item : i)
    return [...list, item].sort((a, b) => a.sort_order - b.sort_order)
  }

  /**
   * Загружает список. Одновременно идёт только одна загрузка: если пока она шла,
   * попросили ещё раз, — повторяем после неё (иначе две загрузки могли бы
   * одновременно собрать список из меню и задвоить его).
   */
  const loadItems = async ({ silent = false } = {}) => {
    const state = loadState.current
    if (!silent) state.populate = true
    if (state.running) { state.again = true; return }
    state.running = true
    if (!silent) setLoading(true)
    try {
      do {
        state.again = false
        const populate = state.populate
        state.populate = false
        await loadOnce(weekRef.current, populate)
      } while (state.again)
    } finally {
      state.running = false
      setLoading(false)
    }
  }

  /** Перечитать список чуть позже — после пачки изменений с этого или другого устройства. */
  const scheduleReload = () => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => loadItems({ silent: true }), 300)
  }

  /** Данные из базы, но текст, который сейчас печатают на этом устройстве, не трогаем. */
  const mergeFetched = (fetched) => (prev) => fetched.map(item => {
    if (!pendingEdits.current.has(item.id)) return item
    const local = prev.find(p => p.id === item.id)
    return local ? { ...item, text: local.text } : item
  })

  /**
   * populate: если пунктов «из меню» нет — собрать их по меню. Только при открытии
   * страницы/недели, а не при фоновых обновлениях, — иначе «Удалить купленное»
   * тут же возвращало бы удалённые пункты.
   */
  const loadOnce = async (week, populate) => {
    const { data: mItems, error: mErr } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('source', 'menu')
      .eq('week_start_date', week)
      .order('sort_order')

    const { data: cItems, error: cErr } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('source', 'custom')
      .is('week_start_date', null)
      .order('sort_order')

    if (week !== weekRef.current) { loadState.current.again = true; return } // переключили неделю

    if (mErr || cErr) {
      const err = mErr || cErr
      console.error('loadItems error:', err)
      setDbError(
        err.code === '42P01'
          ? 'Таблица shopping_items не найдена. Запусти migration_column_fix.sql в Supabase SQL Editor.'
          : `Ошибка загрузки: ${err.message}`
      )
      return
    }
    setDbError('')
    setCustomItems(mergeFetched(cItems || []))

    if ((mItems && mItems.length > 0) || !populate) {
      setMenuItems(mergeFetched(mItems || []))
    } else {
      await populateFromMenu(week)
    }
  }

  const populateFromMenu = async (week) => {
    const { data: weekMenu } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_start_date', week)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!weekMenu) { setMenuItems([]); setMenuStatus('none'); return }

    const { data: slots } = await supabase
      .from('menu_slots')
      .select('*, dishes(*, ingredients(*))')
      .eq('menu_id', weekMenu.id)
      .eq('is_leftover', false)

    if (!slots || slots.length === 0) { setMenuItems([]); setMenuStatus('empty'); return }

    const cookingSlots = slots
      .filter(slot => slot.dishes)
      .map(slot => ({ dish: slot.dishes, servingsUsed: slot.servings_used ?? slot.dishes.servings_count }))

    const { items, error } = await syncMenuShoppingItems(user.id, week, cookingSlots)
    if (week !== weekRef.current) return
    if (error) {
      console.error('populateFromMenu error:', error)
      setDbError(
        error.code === '42P01'
          ? 'Таблица shopping_items не найдена. Запусти migration_column_fix.sql в Supabase SQL Editor.'
          : 'Не получилось собрать список из меню. Обнови страницу через минуту.'
      )
      return
    }
    setMenuItems(items || [])
    setMenuStatus('empty')
  }

  const saveText = useCallback((id, text) => {
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    pendingEdits.current.add(id)
    const timer = setTimeout(async () => {
      await supabase.from('shopping_items').update({ text }).eq('id', id)
      if (saveTimers.current[id] === timer) {  // пока сохраняли, новых правок не было
        pendingEdits.current.delete(id)
        delete saveTimers.current[id]
      }
    }, 600)
    saveTimers.current[id] = timer
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

  /** Удалить один пункт: из меню (если продукт уже есть дома) или свой. */
  const deleteItem = async (id, source) => {
    // Текст этого пункта мог ещё сохраняться — отменяем, пункта больше нет
    if (saveTimers.current[id]) {
      clearTimeout(saveTimers.current[id])
      delete saveTimers.current[id]
    }
    pendingEdits.current.delete(id)

    if (source === 'menu') setMenuItems(prev => prev.filter(i => i.id !== id))
    else setCustomItems(prev => prev.filter(i => i.id !== id))

    const { error } = await supabase.from('shopping_items').delete().eq('id', id)
    if (error) {
      console.error('deleteItem error:', error)
      setDbError('Не получилось удалить пункт. Обнови страницу и попробуй ещё раз.')
      loadItems({ silent: true })  // возвращаем пункт на экран, раз в базе он остался
    }
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
    flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
    fontSize: '0.9rem', fontFamily: 'inherit', padding: 0,
    color: 'var(--color-text-primary)',
    textDecoration: checked ? 'line-through' : 'none',
  })

  const DeleteButton = ({ onClick, text }) => (
    <button
      type="button"
      className="item-delete"
      onClick={onClick}
      aria-label={`Удалить «${text}»`}
      title="Удалить"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </button>
  )

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
            {menuStatus === 'empty' ? (
              'В меню на эту неделю нет продуктов для покупки: у блюд не указаны ингредиенты или всё есть дома.'
            ) : (
              <>
                Меню на эту неделю ещё не создано.{' '}
                <span
                  style={{ color: 'var(--color-primary)', cursor: 'pointer' }}
                  onClick={() => navigate('/menu')}
                >
                  Сгенерировать →
                </span>
              </>
            )}
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
              <DeleteButton onClick={() => deleteItem(item.id, 'menu')} text={item.text} />
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
          <DeleteButton onClick={() => deleteItem(item.id, 'custom')} text={item.text} />
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
