import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов.')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают.')
      return
    }

    setLoading(true)
    const { error } = await signUp(email, password)
    setLoading(false)

    if (error) {
      if (error.message?.includes('already registered')) {
        setError('Этот email уже зарегистрирован. Попробуй войти.')
      } else {
        setError('Ошибка при регистрации. Попробуй ещё раз.')
      }
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: 16 }}>✉️</span>
          <h2 style={{ marginBottom: 12 }}>Проверь почту!</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>
            Мы отправили письмо на <strong>{email}</strong>.<br />
            Перейди по ссылке в письме, чтобы подтвердить аккаунт.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            Перейти ко входу
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="icon">🍽️</span>
          <h1>Планировщик меню</h1>
          <p>Создай свой аккаунт</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Минимум 6 символов"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm">Повтори пароль</label>
            <input
              id="confirm"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            disabled={loading}
          >
            {loading ? 'Создаём аккаунт...' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="auth-divider">
          Уже есть аккаунт?{' '}
          <span className="auth-link" onClick={() => navigate('/login')}>
            Войти
          </span>
        </p>
      </div>
    </div>
  )
}
