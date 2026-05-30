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

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="audio-player-container">
      <audio
        ref={audioRef}
        src={fileUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        onError={() => setError(true)}
      />

      <div className="audio-player-row">
        <span className="audio-filename" title={fileName}>🎵 {fileName}</span>

        <button
          type="button"
          className="audio-play-btn"
          onClick={handlePlayPause}
          disabled={error}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="audio-progress-wrapper">
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            disabled={error}
            className="audio-progress-bar"
          />
        </div>

        <span className="audio-time">
          {error ? 'Unavailable' : `${formatTime(currentTime)} / ${formatTime(duration)}`}
        </span>

        {onDelete && (
          <button
            type="button"
            className="audio-delete-btn"
            onClick={onDelete}
            title="Delete audio file"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  )
}

export default AudioPlayer
