import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import BhajanDetailsModal from '../components/BhajanDetailsModal'
import LyricsModal from '../components/LyricsModal'
import Spinner from '../components/Spinner'
import '../styles/Dashboard.css'

function Dashboard({ user, userRole }) {
  const navigate = useNavigate()
  const [bhajans, setBhajans] = useState([])
  const [filteredBhajans, setFilteredBhajans] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTheme, setFilterTheme] = useState('')
  const [filterRaga, setFilterRaga] = useState('')
  const [filterLanguage, setFilterLanguage] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCopyright, setFilterCopyright] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20
  const [stats, setStats] = useState({
    totalBhajans: 0,
    totalContributors: 0,
    approvedCopyrights: 0,
    draftBhajans: 0
  })
  const [themes, setThemes] = useState([])
  const [themeColors, setThemeColors] = useState({})
  const [ragas, setRagas] = useState([])
  const [languages, setLanguages] = useState([])
  const [selectedBhajan, setSelectedBhajan] = useState(null)
  const [selectedLyrics, setSelectedLyrics] = useState(null)

  useEffect(() => {
    loadBhajans()
    loadStats()
    loadThemeColors()
  }, [])

  const loadThemeColors = async () => {
    const { data } = await supabase.from('themes').select('name, color')
    if (data) {
      const map = {}
      data.forEach(t => { if (t.name) map[t.name] = t.color })
      setThemeColors(map)
    }
  }

  useEffect(() => {
    filterBhajans()
  }, [searchTerm, filterTheme, filterRaga, filterLanguage, filterStatus, filterCopyright, bhajans])

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

      const { data: contributorData } = await supabase
        .from('contributors')
        .select('id')

      setStats({
        totalBhajans: bhajanData?.length || 0,
        totalContributors: contributorData?.length || 0,
        approvedCopyrights: bhajanData?.filter(b => b.copyright_status === 'approved').length || 0,
        draftBhajans: bhajanData?.filter(b => b.status === 'draft').length || 0
      })

      const uniqueThemes = [...new Set(bhajanData?.map(b => b.theme).filter(t => t))]
      setThemes(uniqueThemes)

      const uniqueRagas = [...new Set((bhajanData || []).flatMap(b => (b.raga || '').split(',').map(s => s.trim())).filter(Boolean))].sort()
      setRagas(uniqueRagas)

      const uniqueLanguages = [...new Set((bhajanData || []).map(b => b.language).filter(Boolean))].sort()
      setLanguages(uniqueLanguages)
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

    if (filterLanguage) {
      filtered = filtered.filter(b => b.language === filterLanguage)
    }

    if (filterStatus) {
      filtered = filtered.filter(b => b.status === filterStatus)
    }

    if (filterCopyright) {
      filtered = filtered.filter(b =>
        filterCopyright === 'approved'
          ? b.copyright_status === 'approved'
          : b.copyright_status !== 'approved'
      )
    }

    setFilteredBhajans(filtered)
    setCurrentPage(1)
  }

  const handleDelete = async (id) => {
    if (window.confirm('Delete this bhajan?')) {
      await supabase.from('bhajans').delete().eq('id', id)
      await loadBhajans()
      alert('Bhajan deleted')
    }
  }

  const totalPages = Math.max(1, Math.ceil(filteredBhajans.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageItems = filteredBhajans.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

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
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <p className="stat-label">Contributors</p>
            <p className="stat-value">{stats.totalContributors}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <p className="stat-label">Approved Copyrights</p>
            <p className="stat-value">{stats.approvedCopyrights}</p>
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
            value={filterLanguage}
            onChange={(e) => setFilterLanguage(e.target.value)}
            className="filter-select"
          >
            <option value="">All Languages</option>
            {languages.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
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

          <select
            value={filterCopyright}
            onChange={(e) => setFilterCopyright(e.target.value)}
            className="filter-select"
          >
            <option value="">All Copyrights</option>
            <option value="approved">Copyrighted</option>
            <option value="pending">Pending</option>
          </select>

          {(searchTerm || filterTheme || filterRaga || filterLanguage || filterStatus || filterCopyright) && (
            <button
              onClick={() => {
                setSearchTerm('')
                setFilterTheme('')
                setFilterRaga('')
                setFilterLanguage('')
                setFilterStatus('')
                setFilterCopyright('')
              }}
              className="btn-secondary"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="results-info">
        Showing {filteredBhajans.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}
        –{Math.min(safePage * PAGE_SIZE, filteredBhajans.length)} of {filteredBhajans.length}
        {filteredBhajans.length !== bhajans.length ? ` (filtered from ${bhajans.length})` : ''}
      </div>

      {loading ? (
        <Spinner label="Loading bhajans" />
      ) : filteredBhajans.length === 0 ? (
        <div className="no-results">
          {bhajans.length === 0
            ? 'No bhajans yet. Create one to get started!'
            : 'No bhajans match your filters.'}
        </div>
      ) : (
        <div className="bhajans-list">
          {pageItems.map(bhajan => (
            <div key={bhajan.id} className="bhajan-item">
              <div className="bhajan-info">
                <h3>{bhajan.name}</h3>
                <div className="bhajan-meta">
                  {bhajan.theme && (
                    <span
                      className="meta-badge theme-badge"
                      style={themeColors[bhajan.theme] ? {
                        backgroundColor: `${themeColors[bhajan.theme]}26`,
                        color: themeColors[bhajan.theme],
                        borderColor: `${themeColors[bhajan.theme]}80`
                      } : undefined}
                    >
                      {bhajan.theme}
                    </span>
                  )}
                  {bhajan.language && <span className="meta-badge">{bhajan.language}</span>}
                  {(bhajan.raga || '').split(',').map(s => s.trim()).filter(Boolean).map(r => (
                    <span key={r} className="meta-badge">{r}</span>
                  ))}
                  {(bhajan.tala || '').split(',').map(s => s.trim()).filter(Boolean).map(t => (
                    <span key={t} className="meta-badge">{t}</span>
                  ))}
                  <span className={`status-badge copyright-${bhajan.copyright_status === 'approved' ? 'approved' : 'pending'}`}>
                    {bhajan.copyright_status === 'approved' ? 'COPYRIGHTED' : 'PENDING'}
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

      {!loading && totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn-secondary"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            ← Prev
          </button>
          <span className="pagination-info">Page {safePage} of {totalPages}</span>
          <button
            className="btn-secondary"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
          >
            Next →
          </button>
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
