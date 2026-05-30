import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import BhajanDetailsModal from '../components/BhajanDetailsModal'
import LyricsModal from '../components/LyricsModal'
import '../styles/Dashboard.css'

function Dashboard({ user, userRole }) {
  const navigate = useNavigate()
  const [bhajans, setBhajans] = useState([])
  const [filteredBhajans, setFilteredBhajans] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTheme, setFilterTheme] = useState('')
  const [filterRaga, setFilterRaga] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [stats, setStats] = useState({
    totalBhajans: 0,
    totalWriters: 0,
    totalSingers: 0,
    draftBhajans: 0
  })
  const [themes, setThemes] = useState([])
  const [ragas, setRagas] = useState([])
  const [selectedBhajan, setSelectedBhajan] = useState(null)
  const [selectedLyrics, setSelectedLyrics] = useState(null)

  useEffect(() => {
    loadBhajans()
    loadStats()
  }, [])

  useEffect(() => {
    filterBhajans()
  }, [searchTerm, filterTheme, filterRaga, filterStatus, bhajans])

  const loadBhajans = async () => {
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

  const loadStats = async () => {
    try {
      const { data: bhajanData } = await supabase
        .from('bhajans')
        .select('*')

      const { data: writerData } = await supabase
        .from('bhajan_writers')
        .select('*')

      const { data: singerData } = await supabase
        .from('bhajan_singers')
        .select('*')

      setStats({
        totalBhajans: bhajanData?.length || 0,
        totalWriters: writerData?.length || 0,
        totalSingers: singerData?.length || 0,
        draftBhajans: bhajanData?.filter(b => b.status === 'draft').length || 0
      })

      const uniqueThemes = [...new Set(bhajanData?.map(b => b.theme).filter(t => t))]
      setThemes(uniqueThemes)

      const uniqueRagas = [...new Set((bhajanData || []).flatMap(b => (b.raga || '').split(',').map(s => s.trim())).filter(Boolean))].sort()
      setRagas(uniqueRagas)
    } catch (err) {
      console.error('Error loading stats:', err)
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

    if (filterRaga) {
      filtered = filtered.filter(b =>
        (b.raga || '').split(',').map(s => s.trim()).includes(filterRaga)
      )
    }

    if (filterStatus) {
      filtered = filtered.filter(b => b.status === filterStatus)
    }

    setFilteredBhajans(filtered)
  }

  const handleDelete = async (id) => {
    if (window.confirm('Delete this bhajan?')) {
      await supabase.from('bhajans').delete().eq('id', id)
      await loadBhajans()
      alert('Bhajan deleted')
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Ashram Bhajans Portal</h1>
        <p>Manage and organize bhajans</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📚</div>
          <div className="stat-content">
            <p className="stat-label">Total Bhajans</p>
            <p className="stat-value">{stats.totalBhajans}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✍️</div>
          <div className="stat-content">
            <p className="stat-label">Lyricists & Composers</p>
            <p className="stat-value">{stats.totalWriters}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🎤</div>
          <div className="stat-content">
            <p className="stat-label">Singers</p>
            <p className="stat-value">{stats.totalSingers}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📝</div>
          <div className="stat-content">
            <p className="stat-label">Drafts</p>
            <p className="stat-value">{stats.draftBhajans}</p>
          </div>
        </div>
      </div>

      <div className="search-filter-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search bhajans..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-controls">
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
            value={filterRaga}
            onChange={(e) => setFilterRaga(e.target.value)}
            className="filter-select"
          >
            <option value="">All Ragas</option>
            {ragas.map(raga => (
              <option key={raga} value={raga}>{raga}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>

          {(searchTerm || filterTheme || filterRaga || filterStatus) && (
            <button
              onClick={() => {
                setSearchTerm('')
                setFilterTheme('')
                setFilterRaga('')
                setFilterStatus('')
              }}
              className="btn-secondary"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="results-info">
        Showing {filteredBhajans.length} of {bhajans.length} bhajans
      </div>

      {loading ? (
        <div className="loading">Loading bhajans...</div>
      ) : filteredBhajans.length === 0 ? (
        <div className="no-results">
          {bhajans.length === 0
            ? 'No bhajans yet. Create one to get started!'
            : 'No bhajans match your filters.'}
        </div>
      ) : (
        <div className="bhajans-list">
          {filteredBhajans.map(bhajan => (
            <div key={bhajan.id} className="bhajan-item">
              <div className="bhajan-info">
                <h3>{bhajan.name}</h3>
                <div className="bhajan-meta">
                  {bhajan.theme && <span className="meta-badge">{bhajan.theme}</span>}
                  {(bhajan.raga || '').split(',').map(s => s.trim()).filter(Boolean).map(r => (
                    <span key={r} className="meta-badge">{r}</span>
                  ))}
                  {bhajan.tala && <span className="meta-badge">{bhajan.tala}</span>}
                  <span className={`status-badge status-${bhajan.status}`}>
                    {bhajan.status.toUpperCase()}
                  </span>
                </div>
                {bhajan.duration_minutes && (
                  <p className="bhajan-duration">⏱️ {bhajan.duration_minutes} min</p>
                )}
              </div>
              <div className="bhajan-actions">
                <button
                  onClick={() => setSelectedBhajan(bhajan)}
                  className="btn-secondary"
                >
                  View Details
                </button>
                <button
                  onClick={() => setSelectedLyrics(bhajan)}
                  className="btn-secondary"
                >
                  View Lyrics
                </button>
                <button
                  onClick={() => navigate(`/bhajan/${bhajan.id}/edit`)}
                  className="btn-edit"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(bhajan.id)}
                  className="btn-delete"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedBhajan && (
        <BhajanDetailsModal
          bhajanId={selectedBhajan.id}
          onClose={() => setSelectedBhajan(null)}
        />
      )}
      <LyricsModal
        bhajan={selectedLyrics}
        onClose={() => setSelectedLyrics(null)}
      />
    </div>
  )
}

export default Dashboard
