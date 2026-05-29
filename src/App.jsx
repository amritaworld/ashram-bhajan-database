

import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, getCurrentUser, getUserRole } from './config/supabase'
import './styles/design-system.css'
import './App.css'

// Import pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import ThemeManagement from './pages/ThemeManagement'
import BhajanForm from './pages/BhajanForm'
import UserManagement from './pages/UserManagement'

function App() {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState('viewer')
  const [loading, setLoading] = useState(true)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme-preference')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    checkUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserRole(session.user.id)
      }
    })
    return () => subscription?.unsubscribe()
  }, [])

  useEffect(() => {
    const theme = isDarkMode ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme-preference', theme)
  }, [isDarkMode])

  const checkUser = async () => {
    const { user: currentUser } = await getCurrentUser()
    setUser(currentUser)
    if (currentUser) {
      await fetchUserRole(currentUser.id)
    }
    setLoading(false)
  }

  const fetchUserRole = async (userId) => {
    const { role } = await getUserRole(userId)
    setUserRole(role)
  }

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  return (
    <Router>
      <Routes>
        {!user ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </>
        ) : (
          <>
            <Route path="/dashboard" element={<Dashboard user={user} userRole={userRole} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />} />
            <Route path="/bhajan/new" element={<BhajanForm user={user} userRole={userRole} />} />
            <Route path="/bhajan/:id/edit" element={<BhajanForm user={user} userRole={userRole} />} />
            <Route path="/users" element={userRole === 'admin' ? <UserManagement user={user} /> : <Navigate to="/dashboard" />} />
            {(userRole === 'admin') && (
  <Route path="/themes" element={<ThemeManagement user={user} />} />
)}
<Route path="*" element={<Navigate to="/dashboard" />} />
          </>
        )}
      </Routes>
    </Router>
  )
}

export default App
