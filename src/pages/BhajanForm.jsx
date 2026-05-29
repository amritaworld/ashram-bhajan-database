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

  useEffect(() => {
    getUser()
    if (id) loadBhajan()
  }, [id])

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
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

      // Load audio files from storage
      loadAudioFiles(data.bhajan_id)
    }

    setLoading(false)
  }

  const loadAudioFiles = async (bhajanId) => {
    try {
      console.log('Loading audio files for bhajan_id:', bhajanId)
      const { data, error } = await supabase.storage
        .from('bhajan-audio')
        .list(bhajanId)

      console.log('Storage list response:', { data, error })

      if (error) {
        console.error('Storage error:', error)
        return
      }

      if (data && data.length > 0) {
        const files = data
          .filter(file => file.name !== '.emptyFolderPlaceholder')
          .map((file, idx) => ({
            name: file.name,
            path: `${bhajanId}/${file.name}`,
            version: idx + 1
          }))
        console.log('Found audio files:', files)
        setAudioFiles(files)
      } else {
        console.log('No audio files found')
      }
    } catch (err) {
      console.error('Error loading audio files:', err)
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
      console.log('Uploading to folder:', tempBhajanId)

      for (const file of files) {
        const fileName = `${Date.now()}-${file.name}`
        const filePath = `${tempBhajanId}/${fileName}`

        console.log('Uploading file:', filePath)

        const { data, error } = await supabase.storage
          .from('bhajan-audio')
          .upload(filePath, file, { upsert: false })

        console.log('Upload response:', { data, error })

        if (error) {
          console.error('Upload error details:', error)
          throw error
        }
      }

      alert('Audio files uploaded successfully!')
      e.target.value = ''
      if (id) {
        loadAudioFiles(bhajanId)
      }
    } catch (err) {
      console.error('Full error:', err)
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
          loadAudioFiles(bhajanId)
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
            <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Theme" />
          </div>
          <div className="form-group">
            <label>Raga</label>
            <input value={raga} onChange={(e) => setRaga(e.target.value)} placeholder="Raga" />
          </div>
          <div className="form-group">
            <label>Tala</label>
            <input value={tala} onChange={(e) => setTala(e.target.value)} placeholder="Tala" />
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
            <input value={lyricist} onChange={(e) => {
              const newLyricists = [...lyricists]
              newLyricists[idx] = e.target.value
              setLyricists(newLyricists)
            }} placeholder="Lyricist name" />
            {lyricists.length > 1 && (
              <button onClick={() => setLyricists(lyricists.filter((_, i) => i !== idx))} className="btn-delete">Remove</button>
            )}
          </div>
        ))}
        <button onClick={() => setLyricists([...lyricists, ''])} className="btn-secondary" style={{ marginBottom: '1.5rem' }}>+ Add Lyricist</button>

        <h2 style={{ marginBottom: '1rem' }}>Composers</h2>
        {composers.map((composer, idx) => (
          <div key={idx} className="contributor-item">
            <input value={composer} onChange={(e) => {
              const newComposers = [...composers]
              newComposers[idx] = e.target.value
              setComposers(newComposers)
            }} placeholder="Composer name" />
            {composers.length > 1 && (
              <button onClick={() => setComposers(composers.filter((_, i) => i !== idx))} className="btn-delete">Remove</button>
            )}
          </div>
        ))}
        <button onClick={() => setComposers([...composers, ''])} className="btn-secondary" style={{ marginBottom: '1.5rem' }}>+ Add Composer</button>

        <h2 style={{ marginBottom: '1rem' }}>Singers</h2>
        {singers.map((singer, idx) => (
          <div key={idx} className="contributor-item">
            <input value={singer} onChange={(e) => {
              const newSingers = [...singers]
              newSingers[idx] = e.target.value
              setSingers(newSingers)
            }} placeholder="Singer name" />
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

        {audioFiles.length > 0 && (
          <div className="audio-list">
            <h3>Audio Files</h3>
            {audioFiles.map((audio, idx) => (
              <div key={idx} className="audio-item">
                <div className="audio-info">
                  <p className="audio-name">V{audio.version}: {audio.name}</p>
                  <audio controls style={{ marginTop: '0.5rem', width: '100%' }}>
                    <source src={supabase.storage.from('bhajan-audio').getPublicUrl(audio.path).data.publicUrl} />
                    Your browser does not support the audio element.
                  </audio>
                </div>
                <button onClick={() => handleDeleteAudio(audio.path)} className="btn-delete">Delete</button>
              </div>
            ))}
          </div>
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

export default BhajanForm
