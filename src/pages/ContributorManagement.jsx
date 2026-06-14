import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'
import Spinner from '../components/Spinner'
import { showAlert, showConfirm } from '../components/Dialog'
import '../styles/ContributorManagement.css'

function ContributorManagement() {
  const [contributors, setContributors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    id_proof_type: '',
    id_proof_number: '',
    signature_url: '',
    photo_url: ''
  })
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [uploadingSignature, setUploadingSignature] = useState(false)
  // contributor name (lowercased) -> count of distinct bhajans they contributed to
  const [bhajanCounts, setBhajanCounts] = useState({})

  useEffect(() => {
    fetchContributors()
    fetchBhajanCounts()
  }, [])

  // Count distinct bhajans each contributor appears on, as lyricist/composer
  // (bhajan_writers) or singer (bhajan_singers). Matched by name.
  const fetchBhajanCounts = async () => {
    try {
      const [{ data: writers }, { data: singers }] = await Promise.all([
        supabase.from('bhajan_writers').select('bhajan_id, writer_name'),
        supabase.from('bhajan_singers').select('bhajan_id, singer_name'),
      ])
      const map = {}
      const add = (name, bhajanId) => {
        if (!name || !bhajanId) return
        const key = name.trim().toLowerCase()
        if (!map[key]) map[key] = new Set()
        map[key].add(bhajanId)
      }
      ;(writers || []).forEach(w => add(w.writer_name, w.bhajan_id))
      ;(singers || []).forEach(s => add(s.singer_name, s.bhajan_id))
      const counts = {}
      Object.keys(map).forEach(k => { counts[k] = map[k].size })
      setBhajanCounts(counts)
    } catch (err) {
      console.error('Error loading contributor bhajan counts:', err)
    }
  }

  const fetchContributors = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('contributors')
      .select('*')
      .order('name', { ascending: true })
    
    if (!error) {
      setContributors(data || [])
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

  const handleSignatureUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!formData.name.trim()) {
      showAlert('Please enter contributor name first')
      return
    }

    setUploadingSignature(true)
    try {
      const fileName = `${Date.now()}-${file.name}`
      const filePath = `${formData.name}/${fileName}`

      const { data, error } = await supabase.storage
        .from('signatures')
        .upload(filePath, file, { upsert: false })

      if (error) throw error

      const { data: publicUrlData } = supabase.storage
        .from('signatures')
        .getPublicUrl(filePath)

      setFormData(prev => ({
        ...prev,
        signature_url: publicUrlData.publicUrl
      }))

      showAlert('Signature uploaded successfully!')
    } catch (err) {
      showAlert('Error uploading signature: ' + err.message)
    } finally {
      setUploadingSignature(false)
    }
  }

  const handleDeleteSignature = async () => {
    if (!(await showConfirm('Remove this signature?', { title: 'Remove signature', confirmText: 'Remove', danger: true }))) return
    setFormData(prev => ({
      ...prev,
      signature_url: ''
    }))
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!formData.name.trim()) {
      showAlert('Please enter contributor name first')
      return
    }

    setUploadingPhoto(true)
    try {
      const fileName = `${Date.now()}-${file.name}`
      const filePath = `${formData.name}/photo/${fileName}`

      const { error } = await supabase.storage
        .from('signatures')
        .upload(filePath, file, { upsert: false })

      if (error) throw error

      const { data: publicUrlData } = supabase.storage
        .from('signatures')
        .getPublicUrl(filePath)

      setFormData(prev => ({
        ...prev,
        photo_url: publicUrlData.publicUrl
      }))

      showAlert('Photo uploaded successfully!')
    } catch (err) {
      showAlert('Error uploading photo: ' + err.message)
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleDeletePhoto = async () => {
    if (!(await showConfirm('Remove this photo?', { title: 'Remove photo', confirmText: 'Remove', danger: true }))) return
    setFormData(prev => ({
      ...prev,
      photo_url: ''
    }))
  }

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      id_proof_type: '',
      id_proof_number: '',
      signature_url: '',
      photo_url: ''
    })
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      showAlert('Contributor name is required')
      return
    }

    setLoading(true)
    try {
      if (editingId) {
        const { error } = await supabase
          .from('contributors')
          .update(formData)
          .eq('id', editingId)
        if (error) throw error
        showAlert('Contributor updated successfully!')
      } else {
        const { error } = await supabase
          .from('contributors')
          .insert([formData])
        if (error) throw error
        showAlert('Contributor created successfully!')
      }
      
      resetForm()
      await fetchContributors()
    } catch (err) {
      showAlert('Error: ' + err.message)
    }
    setLoading(false)
  }

  const handleEdit = (contributor) => {
    setFormData(contributor)
    setEditingId(contributor.id)
    setShowForm(true)
  }

  const handleDelete = async (id, name) => {
    if (await showConfirm(`Delete contributor "${name}"?`, { title: 'Delete contributor', confirmText: 'Delete', danger: true })) {
      try {
        await supabase.from('contributors').delete().eq('id', id)
        showAlert('Contributor deleted')
        await fetchContributors()
      } catch (err) {
        showAlert('Error: ' + err.message)
      }
    }
  }

  const filteredContributors = contributors.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="contributor-management-container">
      <div className="contributor-header">
        <h1>Contributor Management</h1>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? 'Cancel' : '+ Add Contributor'}
        </button>
      </div>

      {showForm && (
        <div className="contributor-form-section">
          <h2>{editingId ? 'Edit Contributor' : 'Add New Contributor'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Full name"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="email@example.com"
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="+91 XXXXX XXXXX"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="Full address"
                rows="3"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>ID Proof Type</label>
                <select
                  name="id_proof_type"
                  value={formData.id_proof_type}
                  onChange={handleInputChange}
                >
                  <option value="">Select</option>
                  <option value="Passport">Passport</option>
                  <option value="Aadhar">Aadhar</option>
                  <option value="PAN">PAN</option>
                  <option value="Driving License">Driving License</option>
                  <option value="Voter ID">Voter ID</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>ID Proof Number</label>
                <input
                  type="text"
                  name="id_proof_number"
                  value={formData.id_proof_number}
                  onChange={handleInputChange}
                  placeholder="ID number"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Photo (Image File)</label>
              <div className="file-upload">
                <input
                  id="photo-input"
                  className="file-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                />
                <label htmlFor="photo-input" className="file-upload-btn">
                  <span className="material-symbols-outlined">photo_camera</span> {uploadingPhoto ? 'Uploading...' : 'Choose photo'}
                </label>
              </div>
            </div>

            {formData.photo_url && (
              <div className="signature-preview">
                <img src={formData.photo_url} alt="Contributor Photo Preview" />
                <button
                  type="button"
                  onClick={handleDeletePhoto}
                  className="btn-delete"
                  style={{ marginTop: '0.5rem' }}
                >
                  Remove Photo
                </button>
              </div>
            )}

            <div className="form-group">
              <label>Signature (Image File)</label>
              <div className="file-upload">
                <input
                  id="signature-input"
                  className="file-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handleSignatureUpload}
                  disabled={uploadingSignature}
                />
                <label htmlFor="signature-input" className="file-upload-btn">
                  <span className="material-symbols-outlined">draw</span> {uploadingSignature ? 'Uploading...' : 'Choose signature'}
                </label>
              </div>
            </div>

            {formData.signature_url && (
              <div className="signature-preview">
                <img src={formData.signature_url} alt="Signature Preview" />
                <button
                  type="button"
                  onClick={handleDeleteSignature}
                  className="btn-delete"
                  style={{ marginTop: '0.5rem' }}
                >
                  Remove Signature
                </button>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" disabled={loading || uploadingSignature} className="btn-primary">
                {loading ? 'Saving...' : editingId ? 'Update Contributor' : 'Create Contributor'}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="search-section">
        <input
          type="text"
          placeholder="Search contributors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {loading ? (
        <Spinner label="Loading contributors" />
      ) : filteredContributors.length === 0 ? (
        <div className="no-results">
          {contributors.length === 0
            ? 'No contributors yet. Create one to get started!'
            : 'No contributors match your search.'}
        </div>
      ) : (
        <div className="contributors-grid">
          {filteredContributors.map(contributor => (
            <div key={contributor.id} className="contributor-card">
              <div className="contributor-top">
                {contributor.photo_url ? (
                  <img src={contributor.photo_url} alt={contributor.name} className="contributor-avatar" />
                ) : (
                  <div className="contributor-avatar contributor-avatar-placeholder">
                    <span className="material-symbols-outlined">person</span>
                  </div>
                )}
                <div className="contributor-name-wrap">
                  <h3 className="contributor-name">{contributor.name}</h3>
                  <span className="contributor-bhajan-count">
                    <span className="material-symbols-outlined">music_note</span>
                    {bhajanCounts[(contributor.name || '').trim().toLowerCase()] || 0} bhajan{(bhajanCounts[(contributor.name || '').trim().toLowerCase()] || 0) === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="contributor-details">
                {contributor.email && <p><span className="material-symbols-outlined">mail</span> {contributor.email}</p>}
                {contributor.phone && <p><span className="material-symbols-outlined">call</span> {contributor.phone}</p>}
                {contributor.id_proof_type && (
                  <p className="id-proof">ID: {contributor.id_proof_type} - {contributor.id_proof_number}</p>
                )}
                {contributor.signature_url && (
                  <div className="contributor-signature-mini">
                    <span>Signature</span>
                    <img src={contributor.signature_url} alt={`${contributor.name} signature`} />
                  </div>
                )}
              </div>

              <div className="contributor-actions">
                <button onClick={() => handleEdit(contributor)} className="btn-edit">
                  Edit
                </button>
                <button onClick={() => handleDelete(contributor.id, contributor.name)} className="btn-delete">
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

export default ContributorManagement
