import { useState, useRef } from 'react'
import '../styles/AudioPlayer.css'

function AudioPlayer({ fileName, fileUrl, onDelete }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(false)

  const handlePlayPause = async () => {
    const audio = audioRef.current
    if (!audio) return

    try {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        await audio.play()
        setIsPlaying(true)
      }
    } catch (err) {
      console.error('Audio playback error:', err)
      setError(true)
      setIsPlaying(false)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleSeek = (e) => {
    if (audioRef.current) {
      const time = parseFloat(e.target.value)
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  // Jump by a number of seconds, clamped to the track bounds.
  const skip = (seconds) => {
    const audio = audioRef.current
    if (!audio) return
    const next = Math.min(Math.max(audio.currentTime + seconds, 0), audio.duration || 0)
    audio.currentTime = next
    setCurrentTime(next)
  }

  // Spacebar = play/pause, ←/→ = skip 10s. Scoped to this player: it only fires
  // when the player (a button/the container) is focused, so it never steals the
  // spacebar while you're typing in a form field elsewhere on the page.
  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      handlePlayPause()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      skip(-10)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      skip(10)
    }
  }

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration ? (currentTime / duration) * 100 : 0
  // Gold filled track up to the playhead, muted track after it.
  const seekBackground =
    `linear-gradient(to right, #e8bd62 0%, #d6a84f ${progress}%, #2a2a30 ${progress}%, #2a2a30 100%)`

  return (
    <div
      className="audio-player-card"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      title="Tip: click here, then Space = play/pause, ←/→ = skip 10s"
    >
      <audio
        ref={audioRef}
        src={fileUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        onError={() => setError(true)}
      />

      <div className="audio-top">
        <span className="audio-filename" title={fileName}>🎵 {fileName}</span>
        {onDelete && (
          <button
            type="button"
            className="audio-delete-btn"
            onClick={onDelete}
            title="Delete audio file"
            aria-label="Delete audio file"
          >
            🗑
          </button>
        )}
      </div>

      <div className="audio-seek">
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={currentTime}
          onChange={handleSeek}
          disabled={error}
          className="audio-seek-bar"
          style={{ background: error ? '#2a2a30' : seekBackground }}
          aria-label="Seek"
        />
        <div className="audio-times">
          <span>{formatTime(currentTime)}</span>
          <span>{error ? 'Unavailable' : formatTime(duration)}</span>
        </div>
      </div>

      <div className="audio-controls">
        <button
          type="button"
          className="audio-btn"
          onClick={() => skip(-10)}
          disabled={error}
          title="Back 10 seconds"
          aria-label="Back 10 seconds"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12.5 3C17.15 3 21 6.85 21 11.5C21 16.15 17.15 20 12.5 20C8.6 20 5.31 17.31 4.3 13.73L6.24 13.23C7.03 15.98 9.55 18 12.5 18C16.08 18 19 15.08 19 11.5C19 7.92 16.08 5 12.5 5C9.75 5 7.41 6.72 6.3 9H9V11H3V5H5V7.47C6.55 4.79 9.35 3 12.5 3ZM10 10V15H8V10H10ZM15.5 10C16.33 10 17 10.67 17 11.5V13.5C17 14.33 16.33 15 15.5 15H13.5C12.67 15 12 14.33 12 13.5V11.5C12 10.67 12.67 10 13.5 10H15.5ZM13.5 11.5V13.5H15.5V11.5H13.5Z" />
          </svg>
        </button>

        <button
          type="button"
          className="audio-btn audio-btn-play"
          onClick={handlePlayPause}
          disabled={error}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className="audio-btn"
          onClick={() => skip(10)}
          disabled={error}
          title="Forward 10 seconds"
          aria-label="Forward 10 seconds"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11.5 3C6.85 3 3 6.85 3 11.5C3 16.15 6.85 20 11.5 20C15.4 20 18.69 17.31 19.7 13.73L17.76 13.23C16.97 15.98 14.45 18 11.5 18C7.92 18 5 15.08 5 11.5C5 7.92 7.92 5 11.5 5C14.25 5 16.59 6.72 17.7 9H15V11H21V5H19V7.47C17.45 4.79 14.65 3 11.5 3ZM10 10V15H8V10H10ZM15.5 10C16.33 10 17 10.67 17 11.5V13.5C17 14.33 16.33 15 15.5 15H13.5C12.67 15 12 14.33 12 13.5V11.5C12 10.67 12.67 10 13.5 10H15.5ZM13.5 11.5V13.5H15.5V11.5H13.5Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default AudioPlayer
