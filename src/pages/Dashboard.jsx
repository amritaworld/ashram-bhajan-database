import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, signOut } from '../config/supabase'
import '../styles/Dashboard.css'

function Dashboard({ user, userRole, isDarkMode, onToggleDarkMode }) {
  const [bhajans, setBhajans] = useState([])
  const [filteredBhajans, setFilteredBhajans] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTheme, setFilterTheme] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [themes, setThemes] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    fetchBhajans()
    fetchThemes()
  }, [])

  useEffect(() => {
    filterBhajans()
  }, [bhajans, searchTerm, filterTheme, filterStatus])

  const fetchBhajans = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('bhajans')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) {
      setBhajans(data || [])
    }
    setLoading(false)
  }

  const fetchThemes = async () => {
    const { data, error } = await supabase
      .from('bhajans')
      .select('theme')
      .neq('theme', null)

    if (!error) {
      const uniqueThemes = [...new Set(data.map(b => b.theme).filter(Boolean))]
      setThemes(uniqueThemes)
    }
  }

  const filterBhajans = () => {
    let filtered = bhajans

    if (searchTerm) {
      filtered = filtered.filter(b =>
        b.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (filterTheme) {
      filtered = filtered.filter(b => b.theme === filterTheme)
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(b => b.status === filterStatus)
    }

    setFilteredBhajans(filtered)
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const handleEditBhajan = (bhajanId) => {
    navigate(`/bhajan/${bhajanId}/edit`)
  }

  const handleDeleteBhajan = async (bhajanId, bhajanName) => {
    if (window.confirm(`Delete "${bhajanName}"? This cannot be undone.`)) {
      try {
        const { error } = await supabase
          .from('bhajans')
          .delete()
          .eq('id', bhajanId)

        if (error) throw error

        await fetchBhajans()
        alert('Bhajan deleted successfully')
      } catch (err) {
        alert('Error deleting Bhajan: ' + err.message)
      }
    }
  }

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="nav-brand">Ashram Bhajan Database</div>
        <div className="nav-menu">
          <span className="user-email">{user?.email}</span>
          {(userRole === 'contributor' || userRole === 'admin') && (
            <button onClick={() => navigate('/bhajan/new')} className="nav-button primary">+ Add Bhajan</button>
          )}
          {userRole === 'admin' && (
            <button onClick={() => navigate('/users')} className="nav-button">Users</button>
          )}{userRole === 'admin' && (
  <button onClick={() => navigate('/themes')} className="nav-button">🎨 Manage Themes</button>
)}
          <button className="theme-toggle" onClick={onToggleDarkMode} title="Toggle dark mode">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="nav-button logout">Logout</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="search-filter">
          <input
            type="text"
            placeholder="Search Bhajans..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />

          <select
            value={filterTheme}
            onChange={(e) => setFilterTheme(e.target.value)}
            className="filter-select"
          >
            <option value="">All Themes</option>
            {themes.map(theme => (
              <option key={theme} value={theme}>{theme}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="bhajans-list">
          {loading ? (
            <div className="loading">Loading Bhajans...</div>
          ) : filteredBhajans.length === 0 ? (
            <div className="no-results">No Bhajans found</div>
          ) : (
            filteredBhajans.map(bhajan => (
              <div key={bhajan.id} className="bhajan-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 'var(--space-md)' }}>
                  <h3 style={{ margin: 0 }}>{bhajan.name}</h3>
                  <span className={`copyright-badge ${bhajan.status}`} style={{ textTransform: 'uppercase', fontSize: 'var(--text-xs)' }}>
                    {bhajan.status}
                  </span>
                </div>

                <div className="bhajan-meta">
                  {bhajan.theme && (
                    <div className="bhajan-meta-item">
                      <span className="bhajan-meta-label">Theme:</span>
                      <span className="bhajan-meta-value">{bhajan.theme}</span>
                    </div>
                  )}
                  {bhajan.raga && (
                    <div className="bhajan-meta-item">
                      <span className="bhajan-meta-label">Raga:</span>
                      <span className="bhajan-meta-value">{bhajan.raga}</span>
                    </div>
                  )}
                  {bhajan.tala && (
                    <div className="bhajan-meta-item">
                      <span className="bhajan-meta-label">Tala:</span>
                      <span className="bhajan-meta-value">{bhajan.tala}</span>
                    </div>
                  )}
                  {bhajan.duration_minutes && (
                    <div className="bhajan-meta-item">
                      <span className="bhajan-meta-label">Duration:</span>
                      <span className="bhajan-meta-value">{bhajan.duration_minutes} min</span>
                    </div>
                  )}
                </div>

              <div className="button-group">
                  <button
                    onClick={() => handleEditBhajan(bhajan.id)}
                    className="edit-button"
                    style={{ flex: 1 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteBhajan(bhajan.id, bhajan.name)}
                    className="btn-remove"
                    style={{ flex: 1, padding: 'var(--space-md)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
