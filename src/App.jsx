import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DishesPage from './pages/DishesPage'
import DishFormPage from './pages/DishFormPage'
import DishViewPage from './pages/DishViewPage'
import MenuPage from './pages/MenuPage'
import ShoppingPage from './pages/ShoppingPage'
import SettingsPage from './pages/SettingsPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
    </div>
  )
  if (user) return <Navigate to="/menu" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/menu" replace />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="dishes" element={<DishesPage />} />
        <Route path="dishes/new" element={<DishFormPage />} />
        <Route path="dishes/:id" element={<DishViewPage />} />
        <Route path="dishes/:id/edit" element={<DishFormPage />} />
        <Route path="shopping" element={<ShoppingPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/menu" replace />} />
    </Routes>
  )
}
