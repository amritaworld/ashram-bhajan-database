import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './config/supabase'
import Header from './components/Header'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BhajanForm from './pages/BhajanForm'
import BulkImport from './pages/BulkImport'
import AudioConvert from './pages/AudioConvert'
import UserManagement from './pages/UserManagement'
import ThemeManagement from './pages/ThemeManagement'
import ApiUsage from './pages/ApiUsage'
import ContributorManagement from './pages/ContributorManagement'
import Spinner from './components/Spinner'
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

  if (loading) return <Spinner label="Loading" fullscreen />

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
              <Route path="/import" element={(userRole === 'admin' || userRole === 'contributor') ? <BulkImport user={user} /> : <Navigate to="/dashboard" />} />
              {/* Local-only tool: never reachable on the deployed Vercel app */}
              <Route path="/audio-convert" element={(userRole === 'admin' || userRole === 'contributor') ? <AudioConvert user={user} /> : <Navigate to="/dashboard" />} />
              <Route path="/themes" element={(userRole === 'admin' || userRole === 'contributor') ? <ThemeManagement user={user} /> : <Navigate to="/dashboard" />} />
              <Route path="/users" element={userRole === 'admin' ? <UserManagement user={user} /> : <Navigate to="/dashboard" />} />
              <Route path="/api-usage" element={userRole === 'admin' ? <ApiUsage /> : <Navigate to="/dashboard" />} />
              <Route path="/contributors" element={(userRole === 'admin' || userRole === 'contributor') ? <ContributorManagement user={user} /> : <Navigate to="/dashboard" />} />
              <Route path="/" element={<Navigate to="/dashboard" />} />
            </>
          ) : (
            <>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" />} />
            </>
          )}
        </Routes>
      </main>
    </Router>
  )
}

export default App
