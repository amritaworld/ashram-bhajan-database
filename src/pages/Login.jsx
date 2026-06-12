import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Username login goes through a secure server endpoint that resolves the
      // username to its email, then returns session tokens the browser adopts.
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(out.error || 'Login failed')
      } else {
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: out.access_token,
          refresh_token: out.refresh_token,
        })
        if (sessErr) setError(sessErr.message)
        else navigate('/dashboard')
      }
    } catch {
      setError('Login failed, please try again')
    }
    setLoading(false)
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Bhajans Portal</h1>
        <form onSubmit={handleLogin}>
          {error && <div style={{ color: '#ff5c5c', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</div>}

          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
