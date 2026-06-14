import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import BhajanDetailsModal from '../components/BhajanDetailsModal'
import LyricsModal from '../components/LyricsModal'
import Spinner from '../components/Spinner'
import { showAlert, showConfirm } from '../components/Dialog'
import '../styles/Dashboard.css'

// Listing rule: show Carnatic; if Carnatic is empty, show Hindustani; then the
// legacy single field as a last fallback. Returns a comma-separated string.
const displayRaga = (b) => b.raga_carnatic || b.raga_hindustani || b.raga || ''
const displayTala = (b) => b.tala_carnatic || b.tala_hindustani || b.tala || ''
const toList = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean)
// Every raga a bhajan has across systems — used for the filter dropdown/match.
const allRagas = (b) => toList([b.raga_carnatic, b.raga_hindustani, b.raga].join(','))

// Contributor roles we can filter by (value stored = lowercase, label = display).
const CONTRIBUTOR_ROLES = [
  { value: 'lyricist', label: 'Lyricist' },
  { value: 'composer', label: 'Composer' },
  { value: 'singer', label: 'Singer' },
]

// Format a timestamp as DD-MM-YY for the "last updated" line.
const formatDate = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}-${mm}-${yy}`
}

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
  const [filterContributor, setFilterContributor] = useState('')
  const [filterRoles, setFilterRoles] = useState([])
  const [filterAudio, setFilterAudio] = useState('')
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
  // id -> display name (username, else full name) for the "last updated by" line
  const [userMap, setUserMap] = useState({})
  // bhajan id -> [{ name, role }] for the contributor filter
  const [contributorMap, setContributorMap] = useState({})
  const [contributorNames, setContributorNames] = useState([])
  // Set of bhajan_id slugs that have at least one audio file (for the audio filter)
  const [audioBhajanIds, setAudioBhajanIds] = useState(() => new Set())
  const [selectedBhajan, setSelectedBhajan] = useState(null)
  const [selectedLyrics, setSelectedLyrics] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  useEffect(() => {
    loadBhajans()
    loadStats()
    loadThemeColors()
    loadUsers()
    loadContributorData()
    loadAudioAvailability()
  }, [])

  // Which bhajans have audio: each bhajan's audio lives in a storage folder
  // named after its bhajan_id slug, so the root listing of the bucket gives us
  // exactly the set of bhajan_ids that currently have at least one file.
  const loadAudioAvailability = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('bhajan-audio')
        .list('', { limit: 5000 })
      if (error) throw error
      const ids = new Set(
        (data || [])
          .filter(entry => entry.name && entry.name !== '.emptyFolderPlaceholder')
          .map(entry => entry.name)
      )
      setAudioBhajanIds(ids)
    } catch (err) {
      console.error('Error loading audio availability:', err)
    }
  }

  const loadThemeColors = async () => {
    const { data } = await supabase.from('themes').select('name, color')
    if (data) {
      const map = {}
      data.forEach(t => { if (t.name) map[t.name] = t.color })
      setThemeColors(map)
    }
  }

  // Who edited each bhajan — map user id to a display name for the listing.
  const loadUsers = async () => {
    const { data } = await supabase.from('users').select('id, username, display_name, full_name')
    if (data) {
      const map = {}
      // Prefer the editable Display Name; fall back to legacy full_name, then username.
      data.forEach(u => { map[u.id] = u.display_name || u.full_name || u.username || '' })
      setUserMap(map)
    }
  }

  // Pull lyricist/composer/singer names per bhajan so we can filter by them.
  const loadContributorData = async () => {
    try {
      const [{ data: writers }, { data: singers }] = await Promise.all([
        supabase.from('bhajan_writers').select('bhajan_id, writer_name, writer_role'),
        supabase.from('bhajan_singers').select('bhajan_id, singer_name'),
      ])

      const map = {}
      const names = new Set()
      const add = (bhajanId, name, role) => {
        if (!bhajanId || !name) return
        if (!map[bhajanId]) map[bhajanId] = []
        map[bhajanId].push({ name, role })
        names.add(name)
      }
      ;(writers || []).forEach(w => add(w.bhajan_id, w.writer_name, w.writer_role))
      ;(singers || []).forEach(s => add(s.bhajan_id, s.singer_name, 'singer'))

      setContributorMap(map)
      setContributorNames([...names].sort((a, b) => a.localeCompare(b)))
    } catch (err) {
      console.error('Error loading contributor data:', err)
    }
  }

  useEffect(() => {
    filterBhajans()
  }, [searchTerm, filterTheme, filterRaga, filterLanguage, filterStatus, filterCopyright, filterContributor, filterRoles, filterAudio, audioBhajanIds, contributorMap, bhajans])

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

    // Audio filter — bhajans that do / don't have an audio file in storage.
    if (filterAudio) {
      filtered = filtered.filter(b => {
        const hasAudio = audioBhajanIds.has(b.bhajan_id)
        return filterAudio === 'available' ? hasAudio : !hasAudio
      })
    }

    // Contributor filter: keep bhajans that have a matching contributor.
    // - a name picked  → that person must be on the bhajan
    // - role(s) picked → in one of the picked roles (else any role)
    if (filterContributor || filterRoles.length) {
      const nameLc = filterContributor.toLowerCase()
      filtered = filtered.filter(b => {
        const entries = contributorMap[b.id] || []
        return entries.some(e =>
          (!filterContributor || e.name.toLowerCase() === nameLc) &&
          (filterRoles.length === 0 || filterRoles.includes(e.role))
        )
      })
    }

    setFilteredBhajans(filtered)
    setCurrentPage(1)
  }

  const toggleRole = (role) => {
    setFilterRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  const handleDelete = async (id) => {
    if (await showConfirm('Delete this bhajan? This cannot be undone.', { title: 'Delete bhajan', confirmText: 'Delete', danger: true })) {
      await supabase.from('bhajans').delete().eq('id', id)
      await loadBhajans()
      showAlert('Bhajan deleted')
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
    if (!(await showConfirm(`Delete ${ids.length} selected bhajan${ids.length > 1 ? 's' : ''}? This cannot be undone.`, { title: 'Delete selected', confirmText: 'Delete', danger: true }))) return

    const { error } = await supabase.from('bhajans').delete().in('id', ids)
    if (error) {
      showAlert('Error deleting bhajans: ' + error.message)
      return
    }
    setSelectedIds(new Set())
    await loadBhajans()
    await loadStats()
    showAlert(`Deleted ${ids.length} bhajan${ids.length > 1 ? 's' : ''}`)
  }

  const totalPages = Math.max(1, Math.ceil(filteredBhajans.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageItems = filteredBhajans.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Ashram Bhajanamritam</h1>
        <p>Manage and organize bhajans</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <p className="stat-value">{stats.totalBhajans}</p>
          <p className="stat-label">Total Bhajans</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <p className="stat-value">{stats.totalContributors}</p>
          <p className="stat-label">Contributors</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <p className="stat-value">{stats.approvedCopyrights}</p>
          <p className="stat-label">Approved Copyrights</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z" />
            </svg>
          </div>
          <p className="stat-value">{stats.draftBhajans}</p>
          <p className="stat-label">Drafts</p>
        </div>
      </div>

      <div className="search-filter-section">
        <div className="search-box">
          <span className="search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search by bhajan name or first line of Malayalam lyrics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearchTerm('')}
              title="Clear search"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="filter-controls">
          <div className="filter-field">
            <label className="filter-label">Theme</label>
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
          </div>

          <div className="filter-field">
            <label className="filter-label">Raga</label>
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
          </div>

          <div className="filter-field">
            <label className="filter-label">Language</label>
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
          </div>

          <div className="filter-field">
            <label className="filter-label">Status</label>
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
          </div>

          <div className="filter-field">
            <label className="filter-label">Copyright</label>
            <select
              value={filterCopyright}
              onChange={(e) => setFilterCopyright(e.target.value)}
              className="filter-select"
            >
              <option value="">All Copyrights</option>
              <option value="approved">Copyrighted</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div className="filter-field">
            <label className="filter-label">Audio</label>
            <select
              value={filterAudio}
              onChange={(e) => setFilterAudio(e.target.value)}
              className="filter-select"
            >
              <option value="">All Audio</option>
              <option value="available">Audio available</option>
              <option value="unavailable">No audio</option>
            </select>
          </div>

          {(searchTerm || filterTheme || filterRaga || filterLanguage || filterStatus || filterCopyright || filterContributor || filterRoles.length > 0 || filterAudio) && (
            <button
              onClick={() => {
                setSearchTerm('')
                setFilterTheme('')
                setFilterRaga('')
                setFilterLanguage('')
                setFilterStatus('')
                setFilterCopyright('')
                setFilterContributor('')
                setFilterRoles([])
                setFilterAudio('')
              }}
              className="btn-secondary"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="contributor-filter">
          <div className="filter-field">
            <label className="filter-label">Contributor</label>
            <select
              value={filterContributor}
              onChange={(e) => {
                const v = e.target.value
                setFilterContributor(v)
                // Roles only make sense for a specific contributor — reset (and
                // hide) them when returning to "All Contributors".
                if (!v) setFilterRoles([])
              }}
              className="filter-select"
            >
              <option value="">All Contributors</option>
              {contributorNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div
            className={`role-reveal${filterContributor ? ' open' : ''}`}
            aria-hidden={!filterContributor}
          >
            <div className="role-checkboxes">
              <span className="role-checkboxes-label">as a</span>
              {CONTRIBUTOR_ROLES.map(({ value, label }) => (
                <label key={value} className="role-checkbox">
                  <input
                    type="checkbox"
                    tabIndex={filterContributor ? 0 : -1}
                    checked={filterRoles.includes(value)}
                    onChange={() => toggleRole(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
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
                <span className="material-symbols-outlined">delete</span> Delete Selected ({selectedIds.size})
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
                    <div className="meta-group">
                      <span className="meta-label">Theme</span>
                      <div className="meta-values">
                        <span
                          className="pill pill-theme"
                          style={themeColors[bhajan.theme] ? {
                            backgroundColor: `${themeColors[bhajan.theme]}1f`,
                            color: themeColors[bhajan.theme]
                          } : undefined}
                        >
                          {bhajan.theme}
                        </span>
                      </div>
                    </div>
                  )}
                  {bhajan.language && (
                    <div className="meta-group">
                      <span className="meta-label">Language</span>
                      <div className="meta-values">
                        <span className="pill pill-lang">{bhajan.language}</span>
                      </div>
                    </div>
                  )}
                  {toList(displayRaga(bhajan)).length > 0 && (
                    <div className="meta-group">
                      <span className="meta-label">Raga</span>
                      <div className="meta-values">
                        {toList(displayRaga(bhajan)).map(r => (
                          <span key={r} className="pill pill-raga">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {toList(displayTala(bhajan)).length > 0 && (
                    <div className="meta-group">
                      <span className="meta-label">Tala</span>
                      <div className="meta-values">
                        {toList(displayTala(bhajan)).map(t => (
                          <span key={`tala-${t}`} className="pill pill-tala">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="meta-group">
                    <span className="meta-label">© Status</span>
                    <div className="meta-values">
                      <span className={`pill pill-copyright ${bhajan.copyright_status === 'approved' ? 'approved' : 'pending'}`}>
                        {bhajan.copyright_status === 'approved' ? '© Copyrighted' : '© Pending'}
                      </span>
                    </div>
                  </div>
                </div>
                {bhajan.duration_minutes && (
                  <p className="bhajan-duration"><span className="material-symbols-outlined">schedule</span> {bhajan.duration_minutes} min</p>
                )}
                {bhajan.updated_at && (
                  <p className="bhajan-updated">
                    Last updated on {formatDate(bhajan.updated_at)}
                    {userMap[bhajan.updated_by || bhajan.created_by]
                      ? ` by ${userMap[bhajan.updated_by || bhajan.created_by]}`
                      : ''}
                  </p>
                )}
              </div>
              <div className="bhajan-actions">
                <button onClick={() => setSelectedBhajan(bhajan)} className="row-action">
                  View Details
                </button>
                <button onClick={() => setSelectedLyrics(bhajan)} className="row-action">
                  View Lyrics
                </button>
                <button onClick={() => navigate(`/bhajan/${bhajan.id}/edit`)} className="row-action">
                  Edit
                </button>
                <button onClick={() => handleDelete(bhajan.id)} className="row-action row-action-danger">
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
