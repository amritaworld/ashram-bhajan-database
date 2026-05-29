import '../styles/LyricsModal.css'

function LyricsModal({ bhajan, onClose }) {
  if (!bhajan) return null

  const lyricsData = bhajan.lyrics ?
    (typeof bhajan.lyrics === 'string' ? JSON.parse(bhajan.lyrics) : bhajan.lyrics) :
    {}

  const meaningData = bhajan.meaning ?
    (typeof bhajan.meaning === 'string' ? JSON.parse(bhajan.meaning) : bhajan.meaning) :
    {}

  const hasContent = lyricsData.malayalam || lyricsData.english || meaningData.malayalam || meaningData.english

  if (!hasContent) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{bhajan.name}</h2>
            <button onClick={onClose} className="modal-close">✕</button>
          </div>
          <div className="modal-body">
            <div className="no-lyrics">No lyrics available for this bhajan</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{bhajan.name}</h2>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>

        <div className="modal-body lyrics-modal-body">
          {(lyricsData.malayalam || lyricsData.english) && (
            <div className="lyrics-section-container">
              <h3 className="section-title">Lyrics</h3>
              {lyricsData.malayalam && (
                <div className="language-section">
                  <h4>Malayalam</h4>
                  <div className="lyrics-text">{lyricsData.malayalam}</div>
                </div>
              )}
              {lyricsData.english && (
                <div className="language-section">
                  <h4>English</h4>
                  <div className="lyrics-text">{lyricsData.english}</div>
                </div>
              )}
            </div>
          )}

          {(meaningData.malayalam || meaningData.english) && (
            <div className="meaning-section-container">
              <h3 className="section-title">Meaning & Translation</h3>
              {meaningData.malayalam && (
                <div className="language-section">
                  <h4>Malayalam</h4>
                  <div className="meaning-text">{meaningData.malayalam}</div>
                </div>
              )}
              {meaningData.english && (
                <div className="language-section">
                  <h4>English</h4>
                  <div className="meaning-text">{meaningData.english}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LyricsModal
