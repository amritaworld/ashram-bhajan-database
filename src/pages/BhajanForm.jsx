import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../config/supabase'
import '../styles/Form.css'

function BhajanForm({ user, userRole }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(!!id)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [editingIdx, setEditingIdx] = useState(null)

  const [formData, setFormData] = useState({
    name: '',
    theme: '',
    raga: '',
    tala: '',
    duration_minutes: '',
    year_of_recording: new Date().getFullYear(),
    copyright_holder: 'Mata Amritanandamayi Math',
    copyright_status: 'pending',
    license_type: 'proprietary',
    status: 'draft',
    internal_notes: ''
  })

  const [languages, setLanguages] = useState({
    en: { lyrics: '', meaning: '' },
    ml: { lyrics: '', meaning: '' }
  })

  const [contributors, setContributors] = useState([])
  const [audioFiles, setAudioFiles] = useState([])

  const [newContributor, setNewContributor] = useState({
    name: '',
    role: 'lyricist',
    specialization: '',
    email: '',
    phone: ''
  })

  const [newAudio, setNewAudio] = useState({
    file: null,
    quality: 'standard',
    recording_date: new Date().toISOString().split('T')[0]
  })

  const [suggestions, setSuggestions] = useState({
    themes: [],
    ragas: [],
    talas: []
  })

  useEffect(() => {
    fetchSuggestions()
    if (id && userRole !== 'viewer') {
      loadBhajanData()
    } else {
      setLoading(false)
    }
  }, [])

  const fetchSuggestions = async () => {
    try {
      const { data: bhajans } = await supabase
        .from('bhajans')
        .select('theme, raga, tala')
        .neq('theme', null)

      if (bhajans) {
        const themes = [...new Set(bhajans.map(b => b.theme).filter(Boolean))]
        const ragas = [...new Set(bhajans.map(b => b.raga).filter(Boolean))]
        const talas = [...new Set(bhajans.map(b => b.tala).filter(Boolean))]

        setSuggestions({ themes, ragas, talas })
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err)
    }
  }

  const loadBhajanData = async () => {
    setLoading(true)
    try {
      console.log('Loading bhajan with id:', id)

      const { data: bhajan, error: bhError } = await supabase
        .from('bhajans')
        .select('*')
        .eq('id', id)
        .single()

      if (bhError) {
        console.error('Error loading bhajan:', bhError)
        throw bhError
      }
      if (bhajan) {
        console.log('Bhajan loaded:', bhajan)
        setFormData(bhajan)
      }

      // Load languages
      const { data: langs } = await supabase
        .from('bhajan_languages')
        .select('*')
        .eq('bhajan_id', id)

      console.log('Languages loaded:', langs)

      if (langs && langs.length > 0) {
        const langMap = {}
        langs.forEach(lang => {
          langMap[lang.language_code] = {
            lyrics: lang.lyrics || '',
            meaning: lang.meaning || ''
          }
        })
        setLanguages(prev => ({ ...prev, ...langMap }))
      }

      // Load writers
      const { data: writers, error: wErr } = await supabase
        .from('bhajan_writers')
        .select('*')
        .eq('bhajan_id', id)

      console.log('Writers loaded:', writers, 'Error:', wErr)

      // Load singers
      const { data: singers, error: sErr } = await supabase
        .from('bhajan_singers')
        .select('*')
        .eq('bhajan_id', id)

      console.log('Singers loaded:', singers, 'Error:', sErr)

      const allContributors = []

      if (writers && writers.length > 0) {
        writers.forEach(w => {
          allContributors.push({
            dbId: w.id,
            name: w.writer_name,
            role: w.writer_role,
            specialization: '',
            email: w.contact_email || '',
            phone: w.contact_phone || '',
            type: 'writer',
            isExisting: true
          })
        })
      }

      if (singers && singers.length > 0) {
        singers.forEach(s => {
          allContributors.push({
            dbId: s.id,
            name: s.singer_name,
            role: 'singer',
            specialization: s.specialization || '',
            email: s.contact_email || '',
            phone: s.contact_phone || '',
            type: 'singer',
            isExisting: true
          })
        })
      }

      console.log('Total contributors:', allContributors.length)
      setContributors(allContributors)

      // Load audio files
      const { data: audios, error: aErr } = await supabase
        .from('audio_files')
        .select('*')
        .eq('bhajan_id', id)

      console.log('Audio files loaded:', audios, 'Error:', aErr)
      if (audios && audios.length > 0) {
        setAudioFiles(audios.map(a => ({ ...a, isExisting: true })))
      }

    } catch (err) {
      console.error('Error loading bhajan:', err)
      setError('Error: ' + err.message)
    }
    setLoading(false)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleLanguageChange = (lang, field, value) => {
    setLanguages(prev => ({
      ...prev,
      [lang]: { ...prev[lang], [field]: value }
    }))
  }

  const addContributor = () => {
    if (newContributor.name.trim()) {
      setContributors([...contributors, {
        ...newContributor,
        dbId: null,
        isExisting: false,
        isNew: true
      }])
      setNewContributor({ name: '', role: 'lyricist', specialization: '', email: '', phone: '' })
    }
  }

  const updateContributor = (index, field, value) => {
    const updated = [...contributors]
    updated[index][field] = value
    setContributors(updated)
  }

  const deleteContributor = (index) => {
    setContributors(contributors.filter((_, i) => i !== index))
  }

  const addAudioFile = () => {
    if (newAudio.file) {
      setAudioFiles([...audioFiles, {
        ...newAudio,
        dbId: null,
        file_name: newAudio.file.name,
        isExisting: false,
        isNew: true
      }])
      setNewAudio({ file: null, quality: 'standard', recording_date: new Date().toISOString().split('T')[0] })
    }
  }

  const updateAudioFile = (index, field, value) => {
    const updated = [...audioFiles]
    updated[index][field] = value
    setAudioFiles(updated)
  }

  const deleteAudioFile = (index) => {
    setAudioFiles(audioFiles.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      let bhajanId = id

      if (id) {
        console.log('Updating existing bhajan:', id)
        const { error: updateError } = await supabase
          .from('bhajans')
          .update({ ...formData, updated_by: user.id })
          .eq('id', id)

        if (updateError) throw updateError
      } else {
        console.log('Creating new bhajan')
        const bhajanIdStr = `BHJ-${Date.now()}`
        const { data: newBhajan, error: insertError } = await supabase
          .from('bhajans')
          .insert([{
            ...formData,
            bhajan_id: bhajanIdStr,
            created_by: user.id,
            updated_by: user.id
          }])
          .select()
          .single()

        if (insertError) {
          console.error('Bhajan insert error:', insertError)
          throw insertError
        }

        console.log('New bhajan created with id:', newBhajan.id)
        bhajanId = newBhajan.id

        const langData = Object.entries(languages).map(([code, { lyrics, meaning }]) => ({
          bhajan_id: newBhajan.id,
          language_code: code,
          language_name: code === 'en' ? 'English' : 'Malayalam',
          lyrics,
          meaning
        }))

        const { error: langError } = await supabase
          .from('bhajan_languages')
          .insert(langData)

        if (langError) {
          console.error('Language insert error:', langError)
          throw langError
        }

        console.log('Languages saved')
      }

      console.log('Saving contributors. Total new:', contributors.filter(c => c.isNew).length)

      // Save NEW contributors only
      const newWriters = contributors
        .filter(c => c.isNew && (c.type === 'writer' || c.role !== 'singer'))
        .map(c => ({
          bhajan_id: bhajanId,
          writer_name: c.name,
          writer_role: c.role,
          contact_email: c.email || null,
          contact_phone: c.phone || null,
          created_by: user.id
        }))

      const newSingers = contributors
        .filter(c => c.isNew && c.role === 'singer')
        .map(c => ({
          bhajan_id: bhajanId,
          singer_name: c.name,
          specialization: c.specialization || null,
          contact_email: c.email || null,
          contact_phone: c.phone || null,
          created_by: user.id
        }))

      console.log('Writers to save:', newWriters)
      console.log('Singers to save:', newSingers)

      if (newWriters.length > 0) {
        const { error: writerError, data: writerData } = await supabase
          .from('bhajan_writers')
          .insert(newWriters)

        console.log('Writers insert result:', writerData, 'Error:', writerError)
        if (writerError) throw writerError
      }

      if (newSingers.length > 0) {
        const { error: singerError, data: singerData } = await supabase
          .from('bhajan_singers')
          .insert(newSingers)

        console.log('Singers insert result:', singerData, 'Error:', singerError)
        if (singerError) throw singerError
      }

      console.log('All data saved successfully!')
      navigate('/dashboard')
    } catch (err) {
      console.error('Submit error:', err)
      setError(err.message)
    }

    setSubmitting(false)
  }

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div className="form-container">
      <h1>{id ? 'Edit' : 'Add New'} Bhajan</h1>

      {error && <div className="error-message">{error}</div>}

      {id && (contributors.length > 0 || audioFiles.length > 0) && (
        <div className="info-banner">
          📋 {contributors.length} contributor(s) | {audioFiles.length} audio file(s) — Scroll down to view/edit
        </div>
      )}

      <form onSubmit={handleSubmit} className="bhajan-form">
        <fieldset>
          <legend>Basic Information</legend>

          <div className="form-group">
            <label>Bhajan Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              placeholder="Enter bhajan name"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Theme</label>
              <input
                type="text"
                name="theme"
                value={formData.theme}
                onChange={handleInputChange}
                placeholder="e.g., Krishna, Shiva"
                list="theme-suggestions"
              />
              <datalist id="theme-suggestions">
                {suggestions.themes.map(t => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            <div className="form-group">
              <label>Raga</label>
              <input
                type="text"
                name="raga"
                value={formData.raga}
                onChange={handleInputChange}
                placeholder="e.g., Bhairav"
                list="raga-suggestions"
              />
              <datalist id="raga-suggestions">
                {suggestions.ragas.map(r => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>

            <div className="form-group">
              <label>Tala</label>
              <input
                type="text"
                name="tala"
                value={formData.tala}
                onChange={handleInputChange}
                placeholder="e.g., Adi Taalam"
                list="tala-suggestions"
              />
              <datalist id="tala-suggestions">
                {suggestions.talas.map(t => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Duration (minutes)</label>
              <input
                type="number"
                name="duration_minutes"
                value={formData.duration_minutes}
                onChange={handleInputChange}
                step="0.5"
              />
            </div>

            <div className="form-group">
              <label>Year of Recording</label>
              <input
                type="number"
                name="year_of_recording"
                value={formData.year_of_recording}
                onChange={handleInputChange}
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Contributors {contributors.length > 0 && <span className="count-badge">{contributors.length}</span>}</legend>

          <div className="sub-section">
            <h4>Add Contributor</h4>
            <div className="form-row">
              <input type="text" placeholder="Name *" value={newContributor.name} onChange={(e) => setNewContributor({...newContributor, name: e.target.value})} />
              <select value={newContributor.role} onChange={(e) => setNewContributor({...newContributor, role: e.target.value})}>
                <option value="lyricist">Lyricist</option>
                <option value="composer">Composer</option>
                <option value="singer">Singer</option>
              </select>
              <input type="text" placeholder="Specialization" value={newContributor.specialization} onChange={(e) => setNewContributor({...newContributor, specialization: e.target.value})} />
              <input type="email" placeholder="Email" value={newContributor.email} onChange={(e) => setNewContributor({...newContributor, email: e.target.value})} />
              <button type="button" onClick={addContributor} className="btn-add">+ Add</button>
            </div>
          </div>

          {contributors.length > 0 && (
            <div className="list-section">
              <h4>Contributors ({contributors.length})</h4>
              {contributors.map((c, idx) => (
                <div key={idx}>
                  {editingIdx === idx ? (
                    <div className="edit-item">
                      <div className="form-row">
                        <input type="text" value={c.name} onChange={(e) => updateContributor(idx, 'name', e.target.value)} />
                        <select value={c.role} onChange={(e) => updateContributor(idx, 'role', e.target.value)}>
                          <option value="lyricist">Lyricist</option>
                          <option value="composer">Composer</option>
                          <option value="singer">Singer</option>
                        </select>
                        <input type="text" value={c.specialization} onChange={(e) => updateContributor(idx, 'specialization', e.target.value)} placeholder="Specialization" />
                        <input type="email" value={c.email} onChange={(e) => updateContributor(idx, 'email', e.target.value)} />
                      </div>
                      <div style={{ marginTop: 'var(--space-md)', display: 'flex', gap: 'var(--space-sm)' }}>
                        <button type="button" onClick={() => setEditingIdx(null)} className="btn-add">✓ Save</button>
                        <button type="button" onClick={() => deleteContributor(idx)} className="btn-remove">✕ Delete</button>
                      </div>
                    </div>
                  ) : (
                    <div className="list-item">
                      <div><strong>{c.name}</strong> <span className="contributor-role">• {c.role}</span> {c.specialization && <span className="contributor-spec">• {c.specialization}</span>}</div>
                      <div className="list-actions">
                        <button type="button" onClick={() => setEditingIdx(idx)} className="btn-edit">Edit</button>
                        <button type="button" onClick={() => deleteContributor(idx)} className="btn-remove">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Audio Files {audioFiles.length > 0 && <span className="count-badge">{audioFiles.length}/5</span>}</legend>

          <div className="sub-section">
            <h4>Add Audio File</h4>
            <div className="form-row">
              <input type="file" accept="audio/*" onChange={(e) => setNewAudio({...newAudio, file: e.target.files[0]})} />
              <select value={newAudio.quality} onChange={(e) => setNewAudio({...newAudio, quality: e.target.value})}>
                <option value="low">Low</option>
                <option value="standard">Standard</option>
                <option value="high">High</option>
              </select>
              <input type="date" value={newAudio.recording_date} onChange={(e) => setNewAudio({...newAudio, recording_date: e.target.value})} />
              <button type="button" onClick={addAudioFile} className="btn-add" disabled={audioFiles.length >= 5}>+ Add</button>
            </div>
          </div>

          {audioFiles.length > 0 && (
            <div className="list-section">
              <h4>Audio Files ({audioFiles.length}/5)</h4>
              {audioFiles.map((a, idx) => (
                <div key={idx}>
                  {editingIdx === idx + 100 ? (
                    <div className="edit-item">
                      <div className="form-row">
                        <select value={a.quality} onChange={(e) => updateAudioFile(idx, 'quality', e.target.value)}>
                          <option value="low">Low</option>
                          <option value="standard">Standard</option>
                          <option value="high">High</option>
                        </select>
                        <input type="date" value={a.recording_date} onChange={(e) => updateAudioFile(idx, 'recording_date', e.target.value)} />
                      </div>
                      <div style={{ marginTop: 'var(--space-md)', display: 'flex', gap: 'var(--space-sm)' }}>
                        <button type="button" onClick={() => setEditingIdx(null)} className="btn-add">✓ Save</button>
                        <button type="button" onClick={() => deleteAudioFile(idx)} className="btn-remove">✕ Delete</button>
                      </div>
                    </div>
                  ) : (
                    <div className="list-item">
                      <span><strong>{a.file_name}</strong> • {a.quality} • {a.recording_date}</span>
                      <div className="list-actions">
                        <button type="button" onClick={() => setEditingIdx(idx + 100)} className="btn-edit">Edit</button>
                        <button type="button" onClick={() => deleteAudioFile(idx)} className="btn-remove">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Lyrics & Meaning (English)</legend>
          <div className="form-group">
            <label>Lyrics</label>
            <textarea value={languages.en?.lyrics || ''} onChange={(e) => handleLanguageChange('en', 'lyrics', e.target.value)} placeholder="Enter English lyrics" rows="6" />
          </div>
          <div className="form-group">
            <label>Meaning</label>
            <textarea value={languages.en?.meaning || ''} onChange={(e) => handleLanguageChange('en', 'meaning', e.target.value)} placeholder="Enter English meaning" rows="4" />
          </div>
        </fieldset>

        <fieldset>
          <legend>Lyrics & Meaning (Malayalam)</legend>
          <div className="form-group">
            <label>Lyrics</label>
            <textarea value={languages.ml?.lyrics || ''} onChange={(e) => handleLanguageChange('ml', 'lyrics', e.target.value)} placeholder="Enter Malayalam lyrics" rows="6" />
          </div>
          <div className="form-group">
            <label>Meaning</label>
            <textarea value={languages.ml?.meaning || ''} onChange={(e) => handleLanguageChange('ml', 'meaning', e.target.value)} placeholder="Enter Malayalam meaning" rows="4" />
          </div>
        </fieldset>

        <fieldset>
          <legend>Copyright Information</legend>
          <div className="form-group">
            <label>Copyright Holder</label>
            <input type="text" value={formData.copyright_holder} onChange={(e) => setFormData({...formData, copyright_holder: e.target.value})} placeholder="Mata Amritanandamayi Math" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Copyright Status</label>
              <select name="copyright_status" value={formData.copyright_status} onChange={handleInputChange}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            <div className="form-group">
              <label>License Type</label>
              <select name="license_type" value={formData.license_type} onChange={handleInputChange}>
                <option value="proprietary">Proprietary</option>
                <option value="cc-by">Creative Commons BY</option>
                <option value="cc-by-sa">Creative Commons BY-SA</option>
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Publication Status</legend>
          <div className="form-group">
            <label>Status</label>
            <select name="status" value={formData.status} onChange={handleInputChange}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="form-group">
            <label>Internal Notes</label>
            <textarea name="internal_notes" value={formData.internal_notes} onChange={handleInputChange} placeholder="Private notes for admin only" rows="3" />
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Saving...' : 'Save Bhajan'}</button>
          <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}

export default BhajanForm
