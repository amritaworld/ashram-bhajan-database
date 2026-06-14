import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../config/supabase'
import Spinner from '../components/Spinner'
import { convertToMp3Wasm } from '../utils/wasmAudio'
import '../styles/AudioConvert.css'

const SERVER = 'http://localhost:5180'
// Local helper server can run several at once; the in-browser engine is a
// single wasm instance, so it converts one file at a time.
const CONCURRENCY = { local: 3, browser: 1 }
const AUDIO_EXT = /\.(wma|wav|mp3|m4a|aac|flac|ogg|oga|opus|aiff|aif|alac|wmv|amr)$/i

function formatBytes(n) {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, '')
}

let rowSeq = 0

function AudioConvert({ user }) {
  const [serverUp, setServerUp] = useState(null) // null=checking, true/false
  const [engine, setEngine] = useState('browser') // 'local' | 'browser'
  const [bitrate, setBitrate] = useState('128')
  const [rows, setRows] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [attached, setAttached] = useState([]) // running log: { file, bhajan }
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const activeRef = useRef(0)       // in-flight conversions
  const queueRef = useRef([])       // rows waiting to convert
  const bitrateRef = useRef(bitrate)
  bitrateRef.current = bitrate
  const engineRef = useRef(engine)
  engineRef.current = engine

  const checkServer = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER}/health`)
      const d = await r.json()
      const up = !!d.ok
      setServerUp(up)
      if (up) setEngine('local') // prefer the fast local server when available
    } catch {
      setServerUp(false)
    }
  }, [])

  useEffect(() => { checkServer() }, [checkServer])

  const patch = (id, fields) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)))

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(
      (f) => AUDIO_EXT.test(f.name) || (f.type || '').startsWith('audio/')
    )
    if (!files.length) return
    const newRows = files.map((file) => ({
      id: ++rowSeq,
      file,
      name: file.name,
      origSize: file.size,
      status: 'queued', // queued | converting | done | error
      mp3: null,
      convSize: null,
      error: null,
      attachOpen: false,
      attachStatus: null, // null | 'saving' | 'saved' | 'error'
      attachedTo: null,
    }))
    setRows((prev) => [...prev, ...newRows])
    // Auto-start conversion the moment files arrive — no button needed.
    queueRef.current.push(...newRows)
    pump()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const convertRow = async (row) => {
    patch(row.id, { status: 'converting', error: null })
    try {
      let blob
      if (engineRef.current === 'browser') {
        // In-browser conversion (works on the live site, no helper server).
        blob = await convertToMp3Wasm(row.file, bitrateRef.current)
      } else {
        const res = await fetch(
          `${SERVER}/convert?name=${encodeURIComponent(row.name)}&bitrate=${bitrateRef.current}`,
          { method: 'POST', body: row.file }
        )
        if (!res.ok) {
          let msg = `Server error (${res.status})`
          try { msg = (await res.json()).error || msg } catch { /* not json */ }
          throw new Error(msg)
        }
        blob = await res.blob()
      }
      patch(row.id, { status: 'done', mp3: blob, convSize: blob.size })
    } catch (err) {
      patch(row.id, { status: 'error', error: err.message })
    }
  }

  // Drain the queue, at most CONCURRENCY conversions at once. Safe to call any time.
  const pump = () => {
    while (activeRef.current < (CONCURRENCY[engineRef.current] || 1) && queueRef.current.length) {
      const row = queueRef.current.shift()
      activeRef.current++
      setRunning(true)
      convertRow(row).finally(() => {
        activeRef.current--
        if (activeRef.current === 0 && queueRef.current.length === 0) setRunning(false)
        pump()
      })
    }
  }

  const retryRow = (row) => {
    queueRef.current.push(row)
    pump()
  }

  const retryFailed = () => {
    const failed = rowsRef.current.filter((r) => r.status === 'error')
    queueRef.current.push(...failed)
    pump()
  }

  const clearAll = () => {
    queueRef.current = []
    setRows([])
  }

  const downloadRow = (row) => {
    if (!row.mp3) return
    const url = URL.createObjectURL(row.mp3)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName(row.name)}.mp3`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const downloadAll = () => {
    rowsRef.current.filter((r) => r.status === 'done').forEach((r, i) => {
      setTimeout(() => downloadRow(r), i * 300)
    })
  }

  const attachToBhajan = async (row, bhajan) => {
    patch(row.id, { attachStatus: 'saving' })
    try {
      const path = `${bhajan.bhajan_id}/${baseName(row.name)}.mp3`
      const { error } = await supabase.storage
        .from('bhajan-audio')
        .upload(path, row.mp3, { upsert: true, contentType: 'audio/mpeg' })
      if (error) throw error
      patch(row.id, { attachStatus: 'saved', attachedTo: bhajan.name, attachOpen: false })
      setAttached((prev) => [...prev, { file: `${baseName(row.name)}.mp3`, bhajan: bhajan.name }])
      // Briefly show the "attached" confirmation, then remove the row from the list.
      setTimeout(() => setRows((prev) => prev.filter((r) => r.id !== row.id)), 1200)
    } catch (err) {
      patch(row.id, { attachStatus: 'error', error: 'Attach failed: ' + err.message })
    }
  }

  const doneCount = rows.filter((r) => r.status === 'done').length
  const errorCount = rows.filter((r) => r.status === 'error').length
  const settledCount = rows.filter((r) => r.status === 'done' || r.status === 'error').length
  const overallPct = rows.length ? Math.round((settledCount / rows.length) * 100) : 0
  const stillWorking = rows.some((r) => r.status === 'converting' || r.status === 'queued')
  const totalSaved = rows
    .filter((r) => r.status === 'done')
    .reduce((acc, r) => acc + (r.origSize - r.convSize), 0)

  return (
    <div className="convert-container">
      <div className="convert-card">
        <h1>Audio Converter</h1>
        <p className="convert-intro">
          Standardize audio (WMA, WAV, M4A, FLAC, high-bitrate MP3, …) to the recommended{' '}
          <strong>128&nbsp;kbps stereo MP3</strong> before adding it to a bhajan. Convert here, then{' '}
          <strong>download</strong> the files or <strong>attach</strong> them straight to a bhajan.
        </p>

        {serverUp === null && (
          <div className="convert-progress"><Spinner label="Checking for local helper server…" /></div>
        )}

        {serverUp !== null && (
          <>
            <div className="convert-toolbar">
              <label className="bitrate-select">
                Engine:
                <select value={engine} onChange={(e) => setEngine(e.target.value)}>
                  <option value="local" disabled={!serverUp}>
                    Local server{serverUp ? '' : ' (not running)'}
                  </option>
                  <option value="browser">In browser</option>
                </select>
              </label>
              <label className="bitrate-select">
                Bitrate:
                <select value={bitrate} onChange={(e) => setBitrate(e.target.value)}>
                  <option value="96">96 kbps (smaller)</option>
                  <option value="128">128 kbps (recommended)</option>
                  <option value="160">160 kbps</option>
                  <option value="192">192 kbps (higher quality)</option>
                </select>
              </label>
              <span className="toolbar-hint">Files start converting as soon as you add them.</span>
            </div>

            {engine === 'browser' && (
              <div className="convert-banner">
                Converting <strong>in your browser</strong> — works anywhere, no helper server needed.
                The first file takes a bit longer (it loads the converter, ~25&nbsp;MB once), and large
                files are slower than the local server. Files convert one at a time.
              </div>
            )}
            {engine === 'local' && (
              <div className="convert-banner">
                Using the <strong>local helper server</strong> (fast). Only available on your computer.
              </div>
            )}
            {!serverUp && (
              <div className="convert-banner subtle">
                Local server not detected. To use it, run <code>npm run server</code> and{' '}
                <button className="link-btn" onClick={checkServer}>re-check</button>.
              </div>
            )}

            <div
              className={`convert-picker ${isDragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                id="audio-convert-input"
                className="convert-input"
                type="file"
                multiple
                accept="audio/*,.wma,.wav,.m4a,.aac,.flac,.ogg,.opus,.aiff,.aif,.amr"
                onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
              />
              <label htmlFor="audio-convert-input" className="convert-label">
                <span className="convert-icon material-symbols-outlined">library_music</span>
                <span className="convert-text">Choose audio files</span>
                <span className="convert-hint">or drag files here — WMA, WAV, M4A, FLAC, MP3…</span>
              </label>
            </div>

            {attached.length > 0 && (
              <div className="attached-log">
                <strong>Attached to bhajans ({attached.length}):</strong>
                <ul>
                  {attached.map((a, i) => (
                    <li key={i}>✓ {a.file} → “{a.bhajan}”</li>
                  ))}
                </ul>
              </div>
            )}

            {rows.length > 0 && (
              <>
                {stillWorking && (
                  <div className="overall">
                    <div className="overall-label">
                      Converting {settledCount}/{rows.length}…
                    </div>
                    <div className="overall-track">
                      <div className="overall-fill" style={{ width: `${overallPct}%` }} />
                    </div>
                  </div>
                )}

                <div className="convert-actions">
                  <button className="btn-secondary" onClick={downloadAll} disabled={!doneCount}>
                    Download all ({doneCount})
                  </button>
                  {errorCount > 0 && (
                    <button className="btn-secondary" onClick={retryFailed}>
                      Retry failed ({errorCount})
                    </button>
                  )}
                  <button className="btn-secondary" onClick={clearAll} disabled={stillWorking}>
                    Clear
                  </button>
                  {totalSaved > 0 && (
                    <span className="saved-note">Saved {formatBytes(totalSaved)} so far</span>
                  )}
                </div>

                <div className="convert-table-wrap">
                  <table className="convert-table">
                    <thead>
                      <tr>
                        <th></th><th>File</th><th>Original</th><th>MP3</th><th>Saved</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <ConvertRow
                          key={r.id}
                          row={r}
                          onConvert={() => retryRow(r)}
                          onDownload={() => downloadRow(r)}
                          onToggleAttach={() => patch(r.id, { attachOpen: !r.attachOpen })}
                          onAttach={(b) => attachToBhajan(r, b)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function statusBadge(status) {
  if (status === 'queued') return <span className="st queued">queued</span>
  if (status === 'converting') return <span className="st converting">converting…</span>
  if (status === 'done') return <span className="st done">✓ done</span>
  return <span className="st error">✕ error</span>
}

function pct(orig, conv) {
  if (!orig || conv == null) return ''
  const p = Math.round((1 - conv / orig) * 100)
  return p > 0 ? `${p}%` : '—'
}

function ConvertRow({ row, onConvert, onDownload, onToggleAttach, onAttach }) {
  return (
    <>
      <tr className={`row-${row.status}`}>
        <td className="st-cell">
          {statusBadge(row.status)}
          {row.status === 'converting' && <div className="mini-bar" />}
        </td>
        <td className="file-cell" title={row.name}>{row.name}</td>
        <td>{formatBytes(row.origSize)}</td>
        <td>{row.convSize != null ? formatBytes(row.convSize) : '—'}</td>
        <td>{pct(row.origSize, row.convSize)}</td>
        <td className="act-cell">
          {row.status === 'done' && (
            <>
              <button className="mini-btn" onClick={onDownload}>Download</button>
              <button className="mini-btn" onClick={onToggleAttach}>
                {row.attachOpen ? 'Cancel' : 'Attach…'}
              </button>
            </>
          )}
          {row.status === 'error' && (
            <button className="mini-btn" onClick={onConvert}>Retry</button>
          )}
          {row.attachStatus === 'saving' && <span className="attach-note">saving…</span>}
          {row.attachStatus === 'saved' && (
            <span className="attach-note ok">✓ attached to “{row.attachedTo}”</span>
          )}
        </td>
      </tr>
      {row.error && (
        <tr className="row-errmsg"><td></td><td colSpan={5}>{row.error}</td></tr>
      )}
      {row.attachOpen && (
        <tr className="row-attach">
          <td></td>
          <td colSpan={5}><BhajanPicker onPick={onAttach} /></td>
        </tr>
      )}
    </>
  )
}

function BhajanPicker({ onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('bhajans')
          .select('id, bhajan_id, name, language')
          .ilike('name', `%${q}%`)
          .limit(10)
        if (error) throw error
        setResults(data || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="bhajan-picker">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a bhajan to attach this MP3 to…"
      />
      {loading && <div className="picker-hint">Searching…</div>}
      {!loading && q.length >= 2 && results.length === 0 && (
        <div className="picker-hint">No bhajans found.</div>
      )}
      <div className="picker-results">
        {results.map((b) => (
          <button key={b.id} className="picker-option" onClick={() => onPick(b)}>
            {b.name} <span className="picker-lang">({b.language || '—'})</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default AudioConvert
