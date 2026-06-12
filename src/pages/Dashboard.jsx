import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import BhajanDetailsModal from '../components/BhajanDetailsModal'
import LyricsModal from '../components/LyricsModal'
import Spinner from '../components/Spinner'
import '../styles/Dashboard.css'

// Listing rule: show Carnatic; if Carnatic is empty, show Hindustani; then the
// legacy single field as a last fallback. Returns a comma-separated string.
const displayRaga = (b) => b.raga_carnatic || b.raga_hindustani || b.raga || ''
const displayTala = (b) => b.tala_carnatic || b.tala_hindustani || b.tala || ''
const toList = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean)
// Every raga a bhajan has across systems — used for the filter dropdown/match.
const allRagas = (b) => toList([b.raga_carnatic, b.raga_hindustani, b.raga].join(','))

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
  const [selectedIds, setSelectedIds] = useState(() => new Set())

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

  // Keep selection in sync with what's visible — drop ids that filtered out
  useEffect(() => {
    setSelectedIds(prev => {
      if (prev.size === 0) return prev
      const visible = new Set(filteredBhajans.map(b => b.id))
      const next = new Set([...prev].filter(id => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [filteredBhajans])

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

      const uniqueRagas = [...new Set((bhajanData || []).flatMap(allRagas))].sort()
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
      const searchLower = searchTerm.toLowerCase().trim()
      filtered = filtered.filter(b => {
        // Search by bhajan name
        const nameLower = (b.name || '').toLowerCase()
        if (nameLower.includes(searchLower)) return true

        // Search by first line of Malayalam lyrics
        try {
          const lyricsData = typeof b.lyrics === 'string' ? JSON.parse(b.lyrics) : b.lyrics || {}
          const malayalamLyrics = (lyricsData.malayalam || '').trim()
          if (malayalamLyrics) {
            const firstLine = malayalamLyrics.split('\n')[0].toLowerCase()
            if (firstLine.includes(searchLower)) return true
          }
        } catch (e) {
          // Ignore parse errors
        }

        return false
      })
    }

    if (filterTheme) {
      filtered = filtered.filter(b => b.theme === filterTheme)
    }

    if (filterRaga) {
      filtered = filtered.filter(b => allRagas(b).includes(filterRaga))
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

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFilteredSelected =
    filteredBhajans.length > 0 && filteredBhajans.every(b => selectedIds.has(b.id))

  const toggleSelectAll = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filteredBhajans.map(b => b.id)))
  }

  const handleBulkDelete = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected bhajan${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return

    const { error } = await supabase.from('bhajans').delete().in('id', ids)
    if (error) {
      alert('Error deleting bhajans: ' + error.message)
      return
    }
    setSelectedIds(new Set())
    await loadBhajans()
    await loadStats()
    alert(`Deleted ${ids.length} bhajan${ids.length > 1 ? 's' : ''}`)
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

      {!loading && filteredBhajans.length > 0 && (
        <div className="bulk-actions-bar">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
            />
            Select all {filteredBhajans.length}
          </label>
          {selectedIds.size > 0 && (
            <div className="bulk-actions-right">
              <span className="selected-count">{selectedIds.size} selected</span>
              <button className="btn-delete" onClick={handleBulkDelete}>
                🗑 Delete Selected ({selectedIds.size})
              </button>
            </div>
          )}
        </div>
      )}

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
            <div key={bhajan.id} className={`bhajan-item${selectedIds.has(bhajan.id) ? ' selected' : ''}`}>
              <input
                type="checkbox"
                className="bhajan-select"
                checked={selectedIds.has(bhajan.id)}
                onChange={() => toggleSelect(bhajan.id)}
                aria-label={`Select ${bhajan.name}`}
              />
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
                  {toList(displayRaga(bhajan)).map(r => (
                    <span key={r} className="meta-badge">{r}</span>
                  ))}
                  {toList(displayTala(bhajan)).map(t => (
                    <span key={`tala-${t}`} className="meta-badge">{t}</span>
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
