import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import '../styles/Admin.css'

function ThemeManagement({ user }) {
  const [themes, setThemes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const navigate = useNavigate()

  const [newTheme, setNewTheme] = useState({
    name: '',
    image: null,
    description: ''
  })

  useEffect(() => {
    fetchThemes()
  }, [])

  const fetchThemes = async () => {
    try {
      const { data: bhajans } = await supabase
        .from('bhajans')
        .select('DISTINCT theme')
        .neq('theme', null)

      if (bhajans) {
        const uniqueThemes = bhajans.map(b => b.theme).filter(Boolean)
        
        const themesWithImages = await Promise.all(
          uniqueThemes.map(async (themeName) => {
            const { data: files } = await supabase.storage
              .from('theme-images')
              .list(themeName)
            
            const imageUrl = files && files.length > 0
              ? supabase.storage.from('theme-images').getPublicUrl(`${themeName}/${files[0].name}`).data.publicUrl
              : null

            return { name: themeName, imageUrl, fileCount: files?.length || 0 }
          })
        )

        setThemes(themesWithImages)
      }
    } catch (err) {
      setError('Error fetching themes: ' + err.message)
    }
    setLoading(false)
  }

  const handleUploadThemeImage = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!newTheme.name || !newTheme.image) {
      setError('Please select a theme and image')
      return
    }

    try {
      const fileName = `${newTheme.name}/${Date.now()}-${newTheme.image.name}`
      
      const { error: uploadError } = await supabase.storage
        .from('theme-images')
        .upload(fileName, newTheme.image)

      if (uploadError) throw uploadError

      setSuccess(`Image uploaded for theme "${newTheme.name}"`)
      setNewTheme({ name: '', image: null, description: '' })
      
      setTimeout(() => {
        fetchThemes()
        setSuccess(null)
      }, 1500)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-container">
      <button onClick={() => navigate('/dashboard')} className="back-button">← Back to Dashboard</button>
      
      <h1>Theme Album Art Management</h1>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">✓ {success}</div>}

      <div className="add-user-form">
        <h3>Upload Theme Image</h3>
        <form onSubmit={handleUploadThemeImage}>
          <div className="form-group">
            <label>Theme Name</label>
            <input
              type="text"
              list="theme-list"
              value={newTheme.name}
              onChange={(e) => setNewTheme({...newTheme, name: e.target.value})}
              placeholder="Krishna, Shiva, Divine Mother..."
              required
            />
            <datalist id="theme-list">
              {themes.map(t => (
                <option key={t.name} value={t.name} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label>Image (1:1 ratio, min 500x500px)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setNewTheme({...newTheme, image: e.target.files[0]})}
              required
            />
          </div>

          <button type="submit" className="btn-primary">Upload Image</button>
        </form>
      </div>

      <h2 style={{ marginTop: 'var(--space-2xl)' }}>Themes & Images</h2>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: 'var(--space-xl)',
        marginTop: 'var(--space-xl)'
      }}>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : themes.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)' }}>No themes yet. Create a Bhajan first!</div>
        ) : (
          themes.map(theme => (
            <div key={theme.name} style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-lg)',
              textAlign: 'center'
            }}>
              {theme.imageUrl ? (
                <img 
                  src={theme.imageUrl} 
                  alt={theme.name}
                  style={{
                    width: '100%',
                    aspectRatio: '1/1',
                    objectFit: 'cover',
                    borderRadius: 'var(--radius-lg)',
                    marginBottom: 'var(--space-md)'
                  }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  aspectRatio: '1/1',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 'var(--space-md)',
                  color: 'var(--text-tertiary)'
                }}>
                  No Image
                </div>
              )}
              <h4 style={{ marginBottom: 'var(--space-sm)' }}>{theme.name}</h4>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {theme.fileCount} image{theme.fileCount !== 1 ? 's' : ''}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ThemeManagement
