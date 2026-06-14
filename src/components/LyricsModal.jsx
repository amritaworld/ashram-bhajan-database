import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'
import AudioPlayer from './AudioPlayer'
import '../styles/LyricsModal.css'

function LyricsModal({ bhajan, onClose, userRole }) {
  const [activeLang, setActiveLang] = useState('malayalam')
  const [audioFiles, setAudioFiles] = useState([])
  const [activeAudio, setActiveAudio] = useState(0)

  // Load this bhajan's audio (folder named after its bhajan_id slug).
  useEffect(() => {
    if (!bhajan?.bhajan_id) { setAudioFiles([]); return }
    let cancelled = false
    const load = async () => {
      try {
        const { data } = await supabase.storage.from('bhajan-audio').list(bhajan.bhajan_id)
        const files = (data || [])
          .map(file => ({ file, ts: parseInt((file.name.match(/^(\d+)-/) || [])[1], 10) || 0 }))
          .sort((a, b) => a.ts - b.ts)
          .map(({ file }) => {
            const { data: u } = supabase.storage
              .from('bhajan-audio')
              .getPublicUrl(`${bhajan.bhajan_id}/${file.name}`)
            return { name: file.name, displayName: file.name.replace(/^\d+-/, ''), url: u.publicUrl }
          })
        if (!cancelled) setAudioFiles(files)
      } catch {
        if (!cancelled) setAudioFiles([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [bhajan])

  if (!bhajan) return null

  const lyricsData = bhajan.lyrics
    ? (typeof bhajan.lyrics === 'string' ? JSON.parse(bhajan.lyrics) : bhajan.lyrics)
    : {}
  const malayalam = (lyricsData.malayalam || '').trim()
  const english = (lyricsData.english || '').trim()
  const hasMalayalam = !!malayalam
  const hasEnglish = !!english
  const hasLyrics = hasMalayalam || hasEnglish

  // Respect the toggle, but fall back to whichever language actually has text.
  const showLang =
    activeLang === 'malayalam' && hasMalayalam ? 'malayalam'
    : activeLang === 'english' && hasEnglish ? 'english'
    : hasMalayalam ? 'malayalam' : 'english'
  const text = showLang === 'malayalam' ? malayalam : english

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{bhajan.name}</h2>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>

        <div className="modal-body lyrics-modal-body">
          {audioFiles.length > 0 && (() => {
            const idx = Math.min(activeAudio, audioFiles.length - 1)
            const file = audioFiles[idx]
            return (
              <div className="lyrics-audio">
                {audioFiles.length > 1 && (
                  <div className="version-tabs">
                    {audioFiles.map((f, i) => (
                      <button
                        type="button"
                        key={f.name}
                        className={`version-tab ${i === idx ? 'active' : ''}`}
                        onClick={() => setActiveAudio(i)}
                      >
                        V{i + 1}
                      </button>
                    ))}
                  </div>
                )}
                <AudioPlayer
                  key={file.name}
                  fileName={file.displayName}
                  fileUrl={file.url}
                  version={idx + 1}
                  allowDownload={userRole === 'admin'}
                />
              </div>
            )
          })()}

          {hasLyrics ? (
            <div className="lyrics-section-container">
              {hasMalayalam && hasEnglish && (
                <div className="lyrics-toggle">
                  <button
                    type="button"
                    className={`lyrics-toggle-btn ${showLang === 'malayalam' ? 'active' : ''}`}
                    onClick={() => setActiveLang('malayalam')}
                  >
                    Malayalam
                  </button>
                  <button
                    type="button"
                    className={`lyrics-toggle-btn ${showLang === 'english' ? 'active' : ''}`}
                    onClick={() => setActiveLang('english')}
                  >
                    English (IAST)
                  </button>
                </div>
              )}
              <div className={`lyrics-text ${showLang === 'malayalam' ? 'malayalam' : ''}`}>{text}</div>
            </div>
          ) : (
            <div className="no-lyrics">No lyrics available for this bhajan</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LyricsModal
