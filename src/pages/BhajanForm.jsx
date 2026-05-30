import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../config/supabase'
import AudioPlayer from '../components/AudioPlayer'
import TagInput from '../components/TagInput'
import NOCGenerator from '../components/NOCGenerator'
import ContributorMultiSelect from '../components/ContributorMultiSelect'

function BhajanForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [name, setName] = useState('')
  const [theme, setTheme] = useState('')
  const [ragas, setRagas] = useState([])
  const [talas, setTalas] = useState([])
  const [duration_minutes, setDuration] = useState('')
  const [year_of_recording, setYearOfRecording] = useState(new Date().getFullYear())
  const [lyrics_malayalam, setLyricsMalayalam] = useState('')
  const [lyrics_english, setLyricsEnglish] = useState('')
  const [meaning_malayalam, setMeaningMalayalam] = useState('')
  const [meaning_english, setMeaningEnglish] = useState('')
  const [status, setStatus] = useState('draft')
  const [copyrightHolder, setCopyrightHolder] = useState('Mata Amritanandamayi Math')
  const [copyrightStatus, setCopyrightStatus] = useState('pending')
  const [licenseType, setLicenseType] = useState('proprietary')
  const [showNOC, setShowNOC] = useState(false)
  const [lyricists, setLyricists] = useState([])
  const [composers, setComposers] = useState([])
  const [singers, setSingers] = useState([])
  const [audioFiles, setAudioFiles] = useState([])
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)
  const [bhajanId, setBhajanId] = useState('')
  const [themes, setThemes] = useState([])
  const [contributors, setContributors] = useState([])
  const [suggestions, setSuggestions] = useState({
    themes: [],
    ragas: [],
    talas: [],
    lyricists: [],
    composers: [],
    singers: []
  })

  useEffect(() => {
    getUser()
    loadThemes()
    loadContributors()
    loadSuggestions()
    if (id) loadBhajan()
  }, [id])

  const loadContributors = async () => {
    try {
      const { data, error } = await supabase
        .from('contributors')
        .select('id, name, email')
        .order('name')
      if (error) throw error
      setContributors(data || [])
    } catch (err) {
      console.error('Error loading contributors:', err)
    }
  }

  const loadThemes = async () => {
    try {
      const { data, error } = await supabase
        .from('themes')
        .select('id, name')
        .order('name')
      if (error) throw error
      setThemes(data || [])
    } catch (err) {
      console.error('Error loading themes:', err)
    }
  }

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const loadSuggestions = async () => {
    try {
      const { data: bhajanData } = await supabase
        .from('bhajans')
        .select('theme, raga, tala')

      const { data: writerData } = await supabase
        .from('bhajan_writers')
        .select('writer_name, writer_role')

      const { data: singerData } = await supabase
        .from('bhajan_singers')
        .select('singer_name')

      const themes = [...new Set(bhajanData?.map(b => b.theme).filter(Boolean))].sort()
      const ragas = [...new Set((bhajanData || []).flatMap(b => (b.raga || '').split(',').map(s => s.trim())).filter(Boolean))].sort()
      const talas = [...new Set((bhajanData || []).flatMap(b => (b.tala || '').split(',').map(s => s.trim())).filter(Boolean))].sort()

      const lyricists = [...new Set(writerData?.filter(w => w.writer_role === 'lyricist').map(w => w.writer_name).filter(Boolean))].sort()
      const composers = [...new Set(writerData?.filter(w => w.writer_role === 'composer').map(w => w.writer_name).filter(Boolean))].sort()
      const singers = [...new Set(singerData?.map(s => s.singer_name).filter(Boolean))].sort()

      setSuggestions({
        themes,
        ragas,
        talas,
        lyricists,
        composers,
        singers
      })
    } catch (err) {
      console.log('Error loading suggestions:', err)
    }
  }

  const generateBhajanId = (bhajanName) => {
    return bhajanName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50)
  }

  const loadBhajan = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('bhajans')
      .select('*')
      .eq('id', id)
      .single()

    if (data) {
      setBhajanId(data.bhajan_id)
      setName(data.name || '')
      setTheme(data.theme || '')
      setRagas(data.raga ? data.raga.split(',').map(s => s.trim()).filter(Boolean) : [])
      setTalas(data.tala ? data.tala.split(',').map(s => s.trim()).filter(Boolean) : [])
      setDuration(data.duration_minutes || '')
      setYearOfRecording(data.year_of_recording || new Date().getFullYear())

      try {
        const lyricsData = typeof data.lyrics === 'string' ? JSON.parse(data.lyrics) : data.lyrics || {}
        const meaningData = typeof data.meaning === 'string' ? JSON.parse(data.meaning) : data.meaning || {}
        setLyricsMalayalam(lyricsData.malayalam || '')
        setLyricsEnglish(lyricsData.english || '')
        setMeaningMalayalam(meaningData.malayalam || '')
        setMeaningEnglish(meaningData.english || '')
      } catch (e) {
        setLyricsMalayalam(data.lyrics || '')
        setMeaningMalayalam(data.meaning || '')
      }

      setStatus(data.status || 'draft')
      setCopyrightHolder(data.copyright_holder || 'Mata Amritanandamayi Math')
      setCopyrightStatus(data.copyright_status || 'pending')
      setLicenseType(data.license_type || 'proprietary')

      const { data: writersData } = await supabase
        .from('bhajan_writers')
        .select('*')
        .eq('bhajan_id', id)

      if (writersData && writersData.length > 0) {
        const lyricistsList = writersData.filter(w => w.writer_role === 'lyricist').map(w => w.writer_name)
        const composersList = writersData.filter(w => w.writer_role === 'composer').map(w => w.writer_name)
        setLyricists(lyricistsList)
        setComposers(composersList)
      }

      const { data: singersData } = await supabase
        .from('bhajan_singers')
        .select('*')
        .eq('bhajan_id', id)
      if (singersData && singersData.length > 0) {
        setSingers(singersData.map(s => s.singer_name))
      }

      await loadAudioFiles(data.bhajan_id)
    }

    setLoading(false)
  }

  const loadAudioFiles = async (folderId) => {
    if (!folderId) {
      setAudioFiles([])
      return
    }
    try {
      const { data, error } = await supabase.storage
        .from('bhajan-audio')
        .list(folderId)

      if (error) throw error

      if (data && data.length > 0) {
        const filesWithUrls = data.map(file => {
          const path = `${folderId}/${file.name}`
          const { data: urlData } = supabase.storage
            .from('bhajan-audio')
            .getPublicUrl(path)
          return {
            name: file.name,
            displayName: file.name.replace(/^\d+-/, ''),
            url: urlData.publicUrl,
            path
          }
        })
        setAudioFiles(filesWithUrls)
      } else {
        setAudioFiles([])
      }
    } catch (err) {
      console.error('Error loading audio files:', err)
      setAudioFiles([])
    }
  }

  const handleAudioUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    if (!name) {
      alert('Please enter bhajan name first')
      return
    }

    setUploadingAudio(true)
    try {
      const tempBhajanId = bhajanId || generateBhajanId(name)

      for (const file of files) {
        const fileName = `${Date.now()}-${file.name}`
        const filePath = `${tempBhajanId}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('bhajan-audio')
          .upload(filePath, file, { upsert: false })

        if (uploadError) throw uploadError
      }

      e.target.value = ''
      await loadAudioFiles(tempBhajanId)
    } catch (err) {
      alert('Error uploading audio: ' + err.message)
    } finally {
      setUploadingAudio(false)
    }
  }

  const handleDeleteAudio = async (filePath) => {
    if (!window.confirm('Delete this audio file?')) return
    try {
      const { error } = await supabase.storage.from('bhajan-audio').remove([filePath])
      if (error) throw error
      setAudioFiles(prev => prev.filter(f => f.path !== filePath))
    } catch (err) {
      alert('Error deleting audio: ' + err.message)
    }
  }

  const handleSave = async () => {
    if (!name) {
      alert('Enter bhajan name')
      return
    }

    setLoading(true)
    try {
      const generatedBhajanId = bhajanId || generateBhajanId(name)
      const lyricsObj = { malayalam: lyrics_malayalam, english: lyrics_english }
      const meaningObj = { malayalam: meaning_malayalam, english: meaning_english }

      let savedId = id

      if (id) {
        await supabase
          .from('bhajans')
          .update({
            name, theme, raga: ragas.join(', '), tala: talas.join(', '), duration_minutes, year_of_recording,
            lyrics: JSON.stringify(lyricsObj),
            meaning: JSON.stringify(meaningObj),
            status,
            copyright_holder: copyrightHolder,
            copyright_status: copyrightStatus,
            license_type: licenseType,
            updated_by: user?.id
          })
          .eq('id', id)

        await supabase.from('bhajan_writers').delete().eq('bhajan_id', id)
        await supabase.from('bhajan_singers').delete().eq('bhajan_id', id)
      } else {
        const { data, error } = await supabase
          .from('bhajans')
          .insert([{
            bhajan_id: generatedBhajanId,
            name, theme, raga: ragas.join(', '), tala: talas.join(', '), duration_minutes, year_of_recording,
            lyrics: JSON.stringify(lyricsObj),
            meaning: JSON.stringify(meaningObj),
            status,
            copyright_holder: copyrightHolder,
            copyright_status: copyrightStatus,
            license_type: licenseType,
            created_by: user?.id
          }])
          .select()

        if (error) throw error
        if (!data || data.length === 0) throw new Error('No data returned')
        savedId = data[0].id
        setBhajanId(generatedBhajanId)
      }

      for (const lyricist of lyricists) {
        if (lyricist.trim()) {
          await supabase
            .from('bhajan_writers')
            .insert([{ bhajan_id: savedId, writer_name: lyricist, writer_role: 'lyricist' }])
        }
      }

      for (const composer of composers) {
        if (composer.trim()) {
          await supabase
            .from('bhajan_writers')
            .insert([{ bhajan_id: savedId, writer_name: composer, writer_role: 'composer' }])
        }
      }

      for (const singer of singers) {
        if (singer.trim()) {
          await supabase
            .from('bhajan_singers')
            .insert([{ bhajan_id: savedId, singer_name: singer }])
        }
      }

      alert('Bhajan saved!')
      navigate('/dashboard')
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setLoading(false)
  }

  return (
    <div className="form-container">
      <div className="form-card">
        <h1>{id ? 'Edit Bhajan' : 'Add Bhajan'}</h1>

        <div className="form-group">
          <label>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bhajan name" />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Theme</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">Select theme...</option>
              {themes.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
              {theme && !themes.some(t => t.name === theme) && (
                <option value={theme}>{theme} (legacy)</option>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Raga(s)</label>
            <TagInput
              value={ragas}
              options={suggestions.ragas}
              onChange={setRagas}
              placeholder="Search or add raga(s)..."
            />
          </div>
          <div className="form-group">
            <label>Tala(s)</label>
            <TagInput
              value={talas}
              options={suggestions.talas}
              onChange={setTalas}
              placeholder="Search or add tala(s)..."
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Duration (min)</label>
            <input type="number" value={duration_minutes} onChange={(e) => setDuration(e.target.value)} step="0.1" />
          </div>
          <div className="form-group">
            <label>Year of Recording</label>
            <input type="number" value={year_of_recording} onChange={(e) => setYearOfRecording(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Lyrics</h2>
        <div className="form-group">
          <label>Malayalam</label>
          <textarea value={lyrics_malayalam} onChange={(e) => setLyricsMalayalam(e.target.value)} rows="9" placeholder="Malayalam lyrics" />
        </div>

        <div className="form-group">
          <label>English</label>
          <textarea value={lyrics_english} onChange={(e) => setLyricsEnglish(e.target.value)} rows="9" placeholder="English lyrics" />
        </div>

        <h2 style={{ marginBottom: '1rem' }}>Meaning & Translation</h2>
        <div className="form-group">
          <label>Malayalam</label>
          <textarea value={meaning_malayalam} onChange={(e) => setMeaningMalayalam(e.target.value)} rows="4" placeholder="Malayalam meaning" />
        </div>

        <div className="form-group">
          <label>English</label>
          <textarea value={meaning_english} onChange={(e) => setMeaningEnglish(e.target.value)} rows="4" placeholder="English meaning/translation" />
        </div>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Contributors</h2>
        <div className="contributors-section">
          {[
            { title: 'Lyricists', items: lyricists, setItems: setLyricists, singular: 'Lyricist' },
            { title: 'Composers', items: composers, setItems: setComposers, singular: 'Composer' },
            { title: 'Singers', items: singers, setItems: setSingers, singular: 'Singer' }
          ].map(({ title, items, setItems, singular }) => (
            <div key={title} className="contributor-group">
              <h3 className="contributor-group-title">{title}</h3>
              <ContributorMultiSelect
                value={items}
                contributors={contributors}
                placeholder={`Search ${singular.toLowerCase()}...`}
                onChange={setItems}
              />
            </div>
          ))}
        </div>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Audio Files</h2>
        <div className="form-group">
          <div className="audio-upload-wrapper">
            <input
              id="audio-upload"
              className="audio-file-input"
              type="file"
              accept="audio/*"
              multiple
              onChange={handleAudioUpload}
              disabled={uploadingAudio}
            />
            <label htmlFor="audio-upload" className="audio-upload-label">
              <span className="upload-icon">🎵</span>
              <span className="upload-text">
                {uploadingAudio ? 'Uploading...' : 'Click to upload audio'}
              </span>
              <span className="upload-hint">MP3, WAV, M4A — you can select multiple files</span>
            </label>
          </div>
        </div>

        {audioFiles.length > 0 && (
          <div className="audio-files-list">
            {audioFiles.map((file) => (
              <AudioPlayer
                key={file.path}
                fileName={file.displayName}
                fileUrl={file.url}
                onDelete={() => handleDeleteAudio(file.path)}
              />
            ))}
          </div>
        )}

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Copyright</h2>
        <div className="copyright-card">
          <div className="copyright-row">
            <div className="copyright-item">
              <label>Copyright Holder</label>
              <input
                className="copyright-select"
                value={copyrightHolder}
                onChange={(e) => setCopyrightHolder(e.target.value)}
                placeholder="Mata Amritanandamayi Math"
              />
            </div>
            <div className="copyright-item">
              <label>Copyright Status</label>
              <select
                className="copyright-select"
                value={copyrightStatus}
                onChange={(e) => setCopyrightStatus(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            <div className="copyright-item">
              <label>License Type</label>
              <select
                className="copyright-select"
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value)}
              >
                <option value="proprietary">Proprietary</option>
                <option value="cc-by">Creative Commons BY</option>
                <option value="cc-by-sa">Creative Commons BY-SA</option>
              </select>
            </div>
          </div>
          <div className="noc-button-wrapper">
            <button
              type="button"
              className="btn-noc"
              onClick={() => setShowNOC(true)}
              disabled={!id}
              title={id ? 'Generate No Objection Certificate' : 'Save the bhajan first to generate an NOC'}
            >
              📄 Generate No Objection Certificate (NOC)
            </button>
            {!id && (
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.5rem', textAlign: 'center' }}>
                Save the bhajan first to generate an NOC.
              </p>
            )}
          </div>
        </div>

        {showNOC && id && (
          <NOCGenerator
            bhajanId={id}
            bhajanName={name}
            onClose={() => setShowNOC(false)}
          />
        )}

        <div className="form-actions">
          <button onClick={handleSave} disabled={loading || uploadingAudio} className="btn-primary">
            {loading ? 'Saving...' : id ? 'Update' : 'Create'}
          </button>
          <button onClick={() => navigate('/dashboard')} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

async function logActivity(bhajanId, action, description, changedFields = []) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activity_log').insert([{
      bhajan_id: bhajanId,
      action,
      description,
      changed_fields: changedFields,
      changed_by: user?.id
    }])
  } catch (err) {
    console.log('Error logging activity:', err)
  }
}

export default BhajanForm
