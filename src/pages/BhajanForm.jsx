import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../config/supabase'

function BhajanForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [name, setName] = useState('')
  const [theme, setTheme] = useState('')
  const [raga, setRaga] = useState('')
  const [tala, setTala] = useState('')
  const [duration_minutes, setDuration] = useState('')
  const [year_of_recording, setYearOfRecording] = useState(new Date().getFullYear())
  const [lyrics_malayalam, setLyricsMalayalam] = useState('')
  const [lyrics_english, setLyricsEnglish] = useState('')
  const [meaning_malayalam, setMeaningMalayalam] = useState('')
  const [meaning_english, setMeaningEnglish] = useState('')
  const [status, setStatus] = useState('draft')
  const [lyricists, setLyricists] = useState([''])
  const [composers, setComposers] = useState([''])
  const [singers, setSingers] = useState([''])
  const [audioFiles, setAudioFiles] = useState([])
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)
  const [bhajanId, setBhajanId] = useState('')
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
    loadSuggestions()
    if (id) loadBhajan()
  }, [id])

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
      const ragas = [...new Set(bhajanData?.map(b => b.raga).filter(Boolean))].sort()
      const talas = [...new Set(bhajanData?.map(b => b.tala).filter(Boolean))].sort()

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
      setRaga(data.raga || '')
      setTala(data.tala || '')
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

      const { data: writersData } = await supabase
        .from('bhajan_writers')
        .select('*')
        .eq('bhajan_id', id)

      if (writersData && writersData.length > 0) {
        const lyricistsList = writersData.filter(w => w.writer_role === 'lyricist').map(w => w.writer_name)
        const composersList = writersData.filter(w => w.writer_role === 'composer').map(w => w.writer_name)
        setLyricists(lyricistsList.length > 0 ? lyricistsList : [''])
        setComposers(composersList.length > 0 ? composersList : [''])
      }

      const { data: singersData } = await supabase
        .from('bhajan_singers')
        .select('*')
        .eq('bhajan_id', id)
      if (singersData && singersData.length > 0) {
        setSingers(singersData.map(s => s.singer_name))
      }

      const { data: audioData } = await supabase
        .from('audio_files')
        .select('*')
        .eq('bhajan_id', id)
      if (audioData && audioData.length > 0) {
        setAudioFiles(audioData)
      }
    }

    setLoading(false)
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

      alert('Audio files uploaded successfully!')
      e.target.value = ''
    } catch (err) {
      alert('Error uploading audio: ' + err.message)
    } finally {
      setUploadingAudio(false)
    }
  }

  const handleDeleteAudio = async (filePath) => {
    if (window.confirm('Delete this audio file?')) {
      try {
        await supabase.storage.from('bhajan-audio').remove([filePath])
        alert('Audio file deleted')
        if (id) {
          loadBhajan()
        }
      } catch (err) {
        alert('Error deleting audio: ' + err.message)
      }
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
            name, theme, raga, tala, duration_minutes, year_of_recording,
            lyrics: JSON.stringify(lyricsObj),
            meaning: JSON.stringify(meaningObj),
            status,
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
            name, theme, raga, tala, duration_minutes, year_of_recording,
            lyrics: JSON.stringify(lyricsObj),
            meaning: JSON.stringify(meaningObj),
            status,
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
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              list="themes-list"
              placeholder="Select or type theme..."
            />
            <datalist id="themes-list">
              {suggestions.themes.map(t => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label>Raga</label>
            <input
              value={raga}
              onChange={(e) => setRaga(e.target.value)}
              list="ragas-list"
              placeholder="Select or type raga..."
            />
            <datalist id="ragas-list">
              {suggestions.ragas.map(r => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label>Tala</label>
            <input
              value={tala}
              onChange={(e) => setTala(e.target.value)}
              list="talas-list"
              placeholder="Select or type tala..."
            />
            <datalist id="talas-list">
              {suggestions.talas.map(t => (
                <option key={t} value={t} />
              ))}
            </datalist>
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
          <textarea value={lyrics_malayalam} onChange={(e) => setLyricsMalayalam(e.target.value)} rows="5" placeholder="Malayalam lyrics" />
        </div>

        <div className="form-group">
          <label>English</label>
          <textarea value={lyrics_english} onChange={(e) => setLyricsEnglish(e.target.value)} rows="5" placeholder="English lyrics" />
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

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Lyricists</h2>
        {lyricists.map((lyricist, idx) => (
          <div key={idx} className="contributor-item">
            <input
              value={lyricist}
              onChange={(e) => {
                const newLyricists = [...lyricists]
                newLyricists[idx] = e.target.value
                setLyricists(newLyricists)
              }}
              list="lyricists-list"
              placeholder="Lyricist name"
            />
            <datalist id="lyricists-list">
              {suggestions.lyricists.map(l => (
                <option key={l} value={l} />
              ))}
            </datalist>
            {lyricists.length > 1 && (
              <button onClick={() => setLyricists(lyricists.filter((_, i) => i !== idx))} className="btn-delete">Remove</button>
            )}
          </div>
        ))}
        <button onClick={() => setLyricists([...lyricists, ''])} className="btn-secondary" style={{ marginBottom: '1.5rem' }}>+ Add Lyricist</button>

        <h2 style={{ marginBottom: '1rem' }}>Composers</h2>
        {composers.map((composer, idx) => (
          <div key={idx} className="contributor-item">
            <input
              value={composer}
              onChange={(e) => {
                const newComposers = [...composers]
                newComposers[idx] = e.target.value
                setComposers(newComposers)
              }}
              list="composers-list"
              placeholder="Composer name"
            />
            <datalist id="composers-list">
              {suggestions.composers.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {composers.length > 1 && (
              <button onClick={() => setComposers(composers.filter((_, i) => i !== idx))} className="btn-delete">Remove</button>
            )}
          </div>
        ))}
        <button onClick={() => setComposers([...composers, ''])} className="btn-secondary" style={{ marginBottom: '1.5rem' }}>+ Add Composer</button>

        <h2 style={{ marginBottom: '1rem' }}>Singers</h2>
        {singers.map((singer, idx) => (
          <div key={idx} className="contributor-item">
            <input
              value={singer}
              onChange={(e) => {
                const newSingers = [...singers]
                newSingers[idx] = e.target.value
                setSingers(newSingers)
              }}
              list="singers-list"
              placeholder="Singer name"
            />
            <datalist id="singers-list">
              {suggestions.singers.map(s => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {singers.length > 1 && (
              <button onClick={() => setSingers(singers.filter((_, i) => i !== idx))} className="btn-delete">Remove</button>
            )}
          </div>
        ))}
        <button onClick={() => setSingers([...singers, ''])} className="btn-secondary" style={{ marginBottom: '1.5rem' }}>+ Add Singer</button>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Audio Files</h2>
        <div className="form-group">
          <label>Upload Audio (MP3, WAV, etc)</label>
          <input
            type="file"
            accept="audio/*"
            multiple
            onChange={handleAudioUpload}
            disabled={uploadingAudio}
          />
        </div>
        {uploadingAudio && <p style={{ color: '#d6a84f' }}>Uploading...</p>}

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
