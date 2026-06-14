import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'
import '../styles/ThemeManagement.css'

function ThemeManagement() {
  const [themes, setThemes] = useState([])
  const [themeBhajanCounts, setThemeBhajanCounts] = useState({})
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState({ name: '', color: '#d6a84f', thumbnail_url: '' })
  const [user, setUser] = useState(null)
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false)

  useEffect(() => {
    getUser()
    loadThemes()
  }, [])

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const loadThemes = async () => {
    setLoading(true)
    try {
      const { data: themeData } = await supabase
        .from('themes')
        .select('*')
        .order('name')

      setThemes(themeData || [])

      // Load bhajan counts for each theme
      const { data: bhajanData } = await supabase
        .from('bhajans')
        .select('theme')

      // Count bhajans per theme
      const counts = {}
      if (bhajanData) {
        bhajanData.forEach(bhajan => {
          if (bhajan.theme) {
            counts[bhajan.theme] = (counts[bhajan.theme] || 0) + 1
          }
        })
      }
      setThemeBhajanCounts(counts)
    } catch (err) {
      alert('Error loading themes: ' + err.message)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!formData.name) {
      alert('Theme name is required')
      return
    }

    setLoading(true)
    const isUpdate = editingId && editingId !== 'new'
    try {
      if (isUpdate) {
        const { error } = await supabase
          .from('themes')
          .update(formData)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('themes')
          .insert([formData])
          .select()
        if (error) throw error
        if (!data || data.length === 0) {
          throw new Error('Theme was not saved. The database blocked it (missing insert permission on the themes table).')
        }
      }
      setFormData({ name: '', color: '#d6a84f', thumbnail_url: '' })
      setEditingId(null)
      setSearchQuery('')
      await loadThemes()
      alert(isUpdate ? 'Theme updated!' : 'Theme created!')
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setLoading(false)
  }

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingThumbnail(true)
    try {
      const safeName = (formData.name || 'theme').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      const fileName = `${Date.now()}-${file.name}`
      const filePath = `${safeName}/${fileName}`

      const { error } = await supabase.storage
        .from('theme-images')
        .upload(filePath, file, { upsert: false })

      if (error) throw error

      const { data: publicUrlData } = supabase.storage
        .from('theme-images')
        .getPublicUrl(filePath)

      setFormData(prev => ({ ...prev, thumbnail_url: publicUrlData.publicUrl }))
    } catch (err) {
      alert('Error uploading thumbnail: ' + err.message)
    } finally {
      setUploadingThumbnail(false)
    }
  }

  const handleDeleteThumbnail = () => {
    setFormData(prev => ({ ...prev, thumbnail_url: '' }))
  }

  const handleEdit = (theme) => {
    setEditingId(theme.id)
    setFormData({ name: theme.name, color: theme.color, thumbnail_url: theme.thumbnail_url })
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this theme?')) return
    try {
      await supabase.from('themes').delete().eq('id', id)
      await loadThemes()
      alert('Theme deleted!')
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handleCancel = () => {
    setEditingId(null)
    setFormData({ name: '', color: '#d6a84f', thumbnail_url: '' })
  }

  // Filter themes by search query
  const filteredThemes = themes.filter(theme =>
    theme.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Bhajan Themes</h1>
        {!editingId && (
          <button onClick={() => setEditingId('new')} className="btn-add-theme">
            + Add Theme
          </button>
        )}
      </div>

      {editingId && (
        <div className="theme-form-card">
          <h2>{editingId === 'new' ? 'Add New Theme' : 'Edit Theme'}</h2>
          <div className="form-group">
            <label>Theme Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Krishna, Shiva, Divine Mother"
            />
          </div>
          <div className="form-group">
            <label>Theme Color (for dashboard)</label>
            <div className="color-input-wrapper">
              <input
                type="color"
                value={formData.color || '#d6a84f'}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              />
              <span className="color-value">{formData.color}</span>
            </div>
          </div>
          <div className="form-group">
            <label>Thumbnail</label>
            {formData.thumbnail_url && (
              <div className="thumbnail-preview">
                <img src={formData.thumbnail_url} alt="Theme thumbnail" />
              </div>
            )}
            <div className="thumbnail-actions">
              <div className="file-upload">
                <input
                  id="theme-thumbnail-input"
                  className="file-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailUpload}
                  disabled={uploadingThumbnail}
                />
                <label htmlFor="theme-thumbnail-input" className="file-upload-btn">
                  <span className="material-symbols-outlined">image</span> {uploadingThumbnail ? 'Uploading...' : (formData.thumbnail_url ? 'Replace image' : 'Choose image')}
                </label>
              </div>
              {formData.thumbnail_url && (
                <button type="button" onClick={handleDeleteThumbnail} className="btn-delete">
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="form-actions">
            <button onClick={handleSave} disabled={loading} className="btn-save">
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleCancel} className="btn-cancel">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="themes-section">
        <div className="search-bar">
          <span className="material-symbols-outlined theme-search-icon">search</span>
          <input
            type="text"
            placeholder="Search themes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="theme-search-input"
          />
          {searchQuery && (
            <span className="search-result-count">
              {filteredThemes.length} of {themes.length}
            </span>
          )}
        </div>

        {filteredThemes.length === 0 ? (
          <div className="no-results">
            <p>{searchQuery ? 'No themes found' : 'No themes yet'}</p>
          </div>
        ) : (
          <div className="themes-grid">
            {filteredThemes.map(theme => (
              <div key={theme.id} className="theme-card">
                {theme.thumbnail_url && (
                  <img 
                    src={theme.thumbnail_url} 
                    alt={theme.name} 
                    className="theme-thumbnail"
                  />
                )}
                <div className="theme-info">
                  <div className="theme-header">
                    <h3>{theme.name}</h3>
                    <div 
                      className="theme-color-square"
                      style={{ backgroundColor: theme.color }}
                      title={theme.color}
                    />
                  </div>
                  <div className="theme-bhajan-count">
                    <span className="material-symbols-outlined">music_note</span> {themeBhajanCounts[theme.name] || 0} bhajan{themeBhajanCounts[theme.name] !== 1 ? 's' : ''}
                  </div>
                  <div className="theme-actions">
                    <button 
                      onClick={() => handleEdit(theme)} 
                      className="btn-edit"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(theme.id)} 
                      className="btn-delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ThemeManagement
