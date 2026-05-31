import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'
import ActivityLog from './ActivityLog'
import AudioPlayer from './AudioPlayer'
import Spinner from './Spinner'
import '../styles/BhajanDetailsModal.css'

function BhajanDetailsModal({ bhajanId, onClose }) {
  const [bhajan, setBhajan] = useState(null)
  const [contributors, setContributors] = useState({ lyricists: [], composers: [], singers: [] })
  const [audioFiles, setAudioFiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBhajanDetails()
  }, [bhajanId])

  const loadBhajanDetails = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('bhajans')
        .select('*')
        .eq('id', bhajanId)
        .single()

      if (data) {
        setBhajan(data)
        await loadContributors(bhajanId)
        await loadAudioFiles(data.bhajan_id)
      }
    } catch (err) {
      console.error('Error loading bhajan:', err)
    }
    setLoading(false)
  }

  const loadContributors = async (bhajanId) => {
    try {
      const lyricistNames = []
      const composerNames = []
      const singerNames = []
      const seen = new Set() // role|name to avoid duplicates

      const add = (arr, role, name) => {
        if (!name) return
        const trimmed = name.trim()
        if (!trimmed) return
        const key = role + '|' + trimmed.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        arr.push(trimmed)
      }

      // 1) Names typed on the bhajan form (lyricists/composers)
      const { data: writers } = await supabase
        .from('bhajan_writers')
        .select('writer_name, writer_role')
        .eq('bhajan_id', bhajanId)
      ;(writers || []).forEach(w => {
        if (w.writer_role === 'lyricist') add(lyricistNames, 'lyricist', w.writer_name)
        else if (w.writer_role === 'composer') add(composerNames, 'composer', w.writer_name)
      })

      // 2) Singers typed on the bhajan form
      const { data: bhajanSingers } = await supabase
        .from('bhajan_singers')
        .select('singer_name')
        .eq('bhajan_id', bhajanId)
      ;(bhajanSingers || []).forEach(s => add(singerNames, 'singer', s.singer_name))

      // 3) Contributors linked via the registry (older bhajans)
      const { data: bhajanContributors } = await supabase
        .from('bhajan_contributors')
        .select('contributor_id, role')
        .eq('bhajan_id', bhajanId)

      if (bhajanContributors && bhajanContributors.length > 0) {
        const contributorIds = [...new Set(bhajanContributors.map(c => c.contributor_id))]
        const { data: contributorDetails } = await supabase
          .from('contributors')
          .select('id, name')
          .in('id', contributorIds)
        const nameById = {}
        ;(contributorDetails || []).forEach(cd => { nameById[cd.id] = cd.name })
        bhajanContributors.forEach(c => {
          const name = nameById[c.contributor_id]
          if (c.role === 'lyricist') add(lyricistNames, 'lyricist', name)
          else if (c.role === 'composer') add(composerNames, 'composer', name)
          else if (c.role === 'singer') add(singerNames, 'singer', name)
        })
      }

      setContributors({
        lyricists: lyricistNames.map(name => ({ name })),
        composers: composerNames.map(name => ({ name })),
        singers: singerNames.map(name => ({ name }))
      })
    } catch (err) {
      console.error('Error loading contributors:', err)
    }
  }

  const loadAudioFiles = async (bhajan_id) => {
    try {
      const { data, error } = await supabase.storage
        .from('bhajan-audio')
        .list(bhajan_id)

      if (error) throw error

      if (data && data.length > 0) {
        const filesWithUrls = data.map(file => {
          const { data: urlData } = supabase.storage
            .from('bhajan-audio')
            .getPublicUrl(`${bhajan_id}/${file.name}`)

          const displayName = file.name.replace(/^\d+-/, '')

          return {
            name: file.name,
            displayName: displayName,
            url: urlData.publicUrl,
            created_at: file.created_at
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

  if (loading) return <div className="modal-overlay"><div className="modal-content"><Spinner label="Loading" /></div></div>
  if (!bhajan) return <div className="modal-overlay"><div className="modal-content">Bhajan not found</div></div>

  const statusColor = {
    draft: '#fbbf24',
    published: '#10b981',
    archived: '#8b5cf6'
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{bhajan.name}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="details-grid">
            <div className="detail-item">
              <label>Theme</label>
              <p>{bhajan.theme || '-'}</p>
            </div>
            <div className="detail-item">
              <label>Raga</label>
              <p>{bhajan.raga || '-'}</p>
            </div>
            <div className="detail-item">
              <label>Tala</label>
              <p>{bhajan.tala || '-'}</p>
            </div>
            <div className="detail-item">
              <label>Duration</label>
              <p>{bhajan.duration_minutes ? `${bhajan.duration_minutes} min` : '-'}</p>
            </div>
            <div className="detail-item">
              <label>Year Recorded</label>
              <p>{bhajan.year_of_recording || '-'}</p>
            </div>
            <div className="detail-item">
              <label>Status</label>
              <p style={{ color: statusColor[bhajan.status], fontWeight: 'bold' }}>
                {bhajan.status?.charAt(0).toUpperCase() + bhajan.status?.slice(1)}
              </p>
            </div>
          </div>

          {(contributors.lyricists.length > 0 || contributors.composers.length > 0 || contributors.singers.length > 0) && (
            <div className="contributors-section">
              {contributors.lyricists.length > 0 && (
                <div className="contributor-line">
                  <span className="contributor-role">Lyricists</span>
                  <span className="contributor-names">{contributors.lyricists.map(c => c.name).join(', ')}</span>
                </div>
              )}
              {contributors.composers.length > 0 && (
                <div className="contributor-line">
                  <span className="contributor-role">Composers</span>
                  <span className="contributor-names">{contributors.composers.map(c => c.name).join(', ')}</span>
                </div>
              )}
              {contributors.singers.length > 0 && (
                <div className="contributor-line">
                  <span className="contributor-role">Singers</span>
                  <span className="contributor-names">{contributors.singers.map(c => c.name).join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {audioFiles.length > 0 && (
            <div className="audio-section">
              <h3>🎵 Audio Recordings</h3>
              {audioFiles.map((file, idx) => (
                <AudioPlayer 
                  key={idx}
                  fileName={file.displayName}
                  fileUrl={file.url}
                />
              ))}
            </div>
          )}

          <ActivityLog bhajanId={bhajanId} />
        </div>
      </div>
    </div>
  )
}

export default BhajanDetailsModal
