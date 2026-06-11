import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { isLocalHost } from '../utils/env'
import '../styles/Header.css'

function Header({ userRole }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => location.pathname === path

  const handleNavigation = (path) => {
    navigate(path)
    setMenuOpen(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <h1>Bhajans Portal</h1>
        </div>

        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`nav ${menuOpen ? 'open' : ''}`}>
          <button
            onClick={() => handleNavigation('/dashboard')}
            className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
          >
            Dashboard
          </button>
          {(userRole === 'admin' || userRole === 'contributor') && (
            <>
              <button
                onClick={() => handleNavigation('/themes')}
                className={`nav-link ${isActive('/themes') ? 'active' : ''}`}
              >
                Themes
              </button>
              <button
                onClick={() => handleNavigation('/contributors')}
                className={`nav-link ${isActive('/contributors') ? 'active' : ''}`}
              >
                Contributors
              </button>
              <button
                onClick={() => handleNavigation('/import')}
                className={`nav-link ${isActive('/import') ? 'active' : ''}`}
              >
                Import
              </button>
              {isLocalHost && (
                <button
                  onClick={() => handleNavigation('/audio-convert')}
                  className={`nav-link ${isActive('/audio-convert') ? 'active' : ''}`}
                >
                  Audio Converter
                </button>
              )}
            </>
          )}
          {userRole === 'admin' && (
            <button
              onClick={() => handleNavigation('/users')}
              className={`nav-link ${isActive('/users') ? 'active' : ''}`}
            >
              Users
            </button>
          )}
          <button
            onClick={handleLogout}
            className="nav-link logout"
          >
            Logout
          </button>
          <button
            onClick={() => handleNavigation('/bhajan/new')}
            className="nav-link btn-primary"
          >
            + Add Bhajan
          </button>
        </nav>
      </div>
    </header>
  )
}

export default Header
