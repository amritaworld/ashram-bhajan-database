import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'
import '../styles/ThemeManagement.css'

function ThemeManagement({ user }) {
  const [themes, setThemes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    thumbnail_url: '',
    color: '#d6a84f'
  })
  const [editingId, setEditingId] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  useEffect(() => {
    fetchThemes()
  }, [])

  const fetchThemes = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('themes')
      .select('*')
      .order('name', { ascending: true })

    if (!error) {
      setThemes(data || [])
    }
    setLoading(false)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!formData.name.trim()) {
      alert('Please enter theme name first')
      return
    }

    setUploadingImage(true)
    try {
      const fileName = `${Date.now()}-${file.name}`
      const filePath = `${formData.name}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('theme-images')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const publicUrl = supabase.storage
        .from('theme-images')
        .getPublicUrl(filePath).data.publicUrl

      setFormData(prev => ({
        ...prev,
        thumbnail_url: publicUrl
      }))

      alert('Image uploaded successfully!')
    } catch (err) {
      alert('Error uploading image: ' + err.message)
    } finally {
      setUploadingImage(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      thumbnail_url: '',
      color: '#d6a84f'
    })
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      alert('Theme name is required')
      return
    }

    setLoading(true)
    try {
      if (editingId) {
        await supabase
          .from('themes')
          .update(formData)
          .eq('id', editingId)
        alert('Theme updated!')
      } else {
        await supabase
          .from('themes')
          .insert([formData])
        alert('Theme created!')
      }
      resetForm()
      await fetchThemes()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setLoading(false)
  }

  const handleEdit = (theme) => {
    setFormData(theme)
    setEditingId(theme.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('Delete this theme?')) {
      try {
        await supabase.from('themes').delete().eq('id', id)
        alert('Theme deleted')
        await fetchThemes()
      } catch (err) {
        alert('Error deleting theme: ' + err.message)
      }
    }
  }

  const handleDeleteImage = () => {
    setFormData(prev => ({
      ...prev,
      thumbnail_url: ''
    }))
  }

  return (
    <div className="theme-management-container">
      <div className="theme-header">
        <h1>Bhajan Themes</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? 'Cancel' : '+ Add Theme'}
        </button>
      </div>

      {showForm && (
        <div className="theme-form">
          <h2>{editingId ? 'Edit Theme' : 'Create New Theme'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Theme Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Divine Mother, Spiritual Practice"
                required
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description of this theme..."
                rows="3"
              />
            </div>

            <div className="form-group">
              <label>Thumbnail (1:1 Image)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage}
              />
              {uploadingImage && <p style={{ color: '#d6a84f' }}>Uploading...</p>}
            </div>

            {formData.thumbnail_url && (
              <div className="thumbnail-preview">
                <img src={formData.thumbnail_url} alt="Preview" />
                <button
                  type="button"
                  onClick={handleDeleteImage}
                  className="btn-delete"
                  style={{ marginTop: '0.5rem' }}
                >
                  Remove Image
                </button>
              </div>
            )}

            <div className="form-group">
              <label>Color</label>
              <div className="color-input-group">
                <input
                  type="color"
                  name="color"
                  value={formData.color}
                  onChange={handleInputChange}
                />
                <span className="color-code">{formData.color}</span>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={loading || uploadingImage} className="btn-primary">
                {loading ? 'Saving...' : editingId ? 'Update Theme' : 'Create Theme'}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading themes...</div>
      ) : themes.length === 0 ? (
        <div className="no-results">No themes created yet. Create one to get started!</div>
      ) : (
        <div className="themes-grid">
          {themes.map(theme => (
            <div key={theme.id} className="theme-card">
              {theme.thumbnail_url && (
                <div className="theme-thumbnail">
                  <img src={theme.thumbnail_url} alt={theme.name} />
                </div>
              )}
              <div className="theme-card-content">
                <h3>{theme.name}</h3>
                {theme.description && <p>{theme.description}</p>}
                <div className="theme-color" style={{ backgroundColor: theme.color }} />
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
          ))}
        </div>
      )}
    </div>
  )
}

export default ThemeManagement
