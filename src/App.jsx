import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './config/supabase'
import Header from './components/Header'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import BhajanForm from './pages/BhajanForm'
import UserManagement from './pages/UserManagement'
import ThemeManagement from './pages/ThemeManagement'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth()
    })
    return () => subscription?.unsubscribe()
  }, [])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      setUser(session.user)
      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single()
      setUserRole(data?.role || 'viewer')
    }
    setLoading(false)
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <Router>
      {user && <Header userRole={userRole} />}
      <main className="main-content">
        <Routes>
          {user ? (
            <>
              <Route path="/dashboard" element={<Dashboard user={user} userRole={userRole} />} />
              <Route path="/bhajan/new" element={<BhajanForm user={user} userRole={userRole} />} />
              <Route path="/bhajan/:id/edit" element={<BhajanForm user={user} userRole={userRole} />} />
              <Route path="/themes" element={userRole === 'admin' ? <ThemeManagement user={user} /> : <Navigate to="/dashboard" />} />
              <Route path="/users" element={userRole === 'admin' ? <UserManagement user={user} /> : <Navigate to="/dashboard" />} />
              <Route path="/" element={<Navigate to="/dashboard" />} />
            </>
          ) : (
            <>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/" element={<Navigate to="/login" />} />
            </>
          )}
        </Routes>
      </main>
    </Router>
  )
}

export default App
