import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { parseDocx, generateBhajanId } from '../utils/parseDocx'
import Spinner from '../components/Spinner'
import '../styles/BulkImport.css'

const CHUNK_SIZE = 50

async function mapLimit(items, limit, fn, onTick) {
  const results = new Array(items.length)
  let cursor = 0
  let done = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
      done++
      onTick?.(done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function BulkImport({ user }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('idle')
  const [rows, setRows] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [summary, setSummary] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [skipDuplicates, setSkipDuplicates] = useState(true)

  const collectDocxFiles = async (items) => {
    const files = []
    const traverse = async (entry, path = '') => {
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => {
          entry.file(resolve, reject)
        })
        if (file.name.toLowerCase().endsWith('.docx') && !file.name.startsWith('~$')) {
          file.webkitRelativePath = path ? `${path}/${file.name}` : file.name
          files.push(file)
        }
      } else if (entry.isDirectory) {
        const reader = entry.createReader()
        const entries = await new Promise((resolve, reject) => {
          reader.readEntries(resolve, reject)
        })
        for (const e of entries) {
          await traverse(e, path ? `${path}/${entry.name}` : entry.name)
        }
      }
    }
    for (const item of items) {
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry()
        if (entry) await traverse(entry)
      }
    }
    return files
  }

  const processFiles = async (filesToProcess) => {
    const picked = filesToProcess.filter(
      (f) => f.name.toLowerCase().endsWith('.docx') && !f.name.startsWith('~$')
    )
    if (!picked.length) {
      alert('No .docx files found.')
      return
    }
    await doImport(picked)
  }

  const handlePick = async (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    await processFiles(picked)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const items = Array.from(e.dataTransfer.items || [])

    // Try to get files directly first (simpler fallback)
    const directFiles = items
      .map((item) => {
        if (item.kind === 'file') {
          return item.getAsFile()
        }
        return null
      })
      .filter(Boolean)

    if (directFiles.length > 0) {
      await processFiles(directFiles)
    } else {
      const picked = await collectDocxFiles(items)
      await processFiles(picked)
    }
  }

  const doImport = async (picked) => {
    setIsDragging(false)
    setPhase('parsing')
    setProgress({ done: 0, total: picked.length })

    const parsed = await mapLimit(
      picked,
      6,
      async (file) => {
        const relPath = file.webkitRelativePath || file.name
        const isReview = /(^|\/)_REVIEW\//i.test(relPath)
        const fileDate = new Date(file.lastModified)
        const dateStr = fileDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        try {
          const data = await parseDocx(file)
          return { fileName: file.name, relPath, isReview, data, fileDate: dateStr }
        } catch (err) {
          return { fileName: file.name, relPath, isReview, parseError: err.message, fileDate: dateStr }
        }
      },
      (done) => setProgress((p) => ({ ...p, done }))
    )

    const existingNames = new Set()
    const existingSlugs = new Set()
    try {
      const { data, error } = await supabase.from('bhajans').select('name, bhajan_id')
      if (error) throw error
      for (const b of data || []) {
        if (b.name) existingNames.add(b.name.trim().toLowerCase())
        if (b.bhajan_id) existingSlugs.add(b.bhajan_id)
      }
    } catch (err) {
      alert('Could not load existing bhajans: ' + err.message)
      setPhase('idle')
      return
    }

    const batchSlugs = new Set()
    const seenTitles = new Set()
    const built = parsed.map((p) => {
      if (p.parseError) {
        return { ...p, status: 'error', messages: [p.parseError] }
      }
      const title = (p.data.title || '').trim()
      const messages = []
      if (!title) {
        return { ...p, status: 'error', messages: ['No Title section found'] }
      }
      const titleKey = title.toLowerCase()
      if (existingNames.has(titleKey)) {
        return { ...p, status: 'duplicate', messages: ['Already in database'] }
      }
      if (seenTitles.has(titleKey)) {
        return { ...p, status: 'duplicate', messages: ['Duplicate within batch'] }
      }
      seenTitles.add(titleKey)

      const base = generateBhajanId(title) || 'bhajan'
      let slug = base
      let n = 2
      while (existingSlugs.has(slug) || batchSlugs.has(slug)) slug = `${base}-${n++}`
      batchSlugs.add(slug)

      if (!p.data.language) messages.push('No language')
      if (!p.data.lyrics_malayalam && !p.data.lyrics_english) messages.push('No lyrics')
      if (p.isReview) messages.push('From _REVIEW')

      return {
        ...p,
        title,
        slug,
        status: messages.length ? 'warn' : 'ok',
        messages,
      }
    })

    setRows(built)
    setPhase('preview')
  }

  const counts = rows.reduce(
    (acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc),
    {}
  )
  const importable = rows.filter((r) => {
    if (skipDuplicates && r.status === 'duplicate') return false
    return r.status === 'ok' || r.status === 'warn'
  })

  const buildRecord = (r) => ({
    bhajan_id: r.slug,
    name: r.title,
    language: r.data.language || '',
    lyrics: JSON.stringify({
      malayalam: r.data.lyrics_malayalam || '',
      english: r.data.lyrics_english || '',
    }),
    meaning: JSON.stringify({
      malayalam: r.data.meaning_malayalam || '',
      english: r.data.meaning_english || '',
    }),
    status: 'draft',
    copyright_holder: 'Mata Amritanandamayi Math',
    copyright_status: 'pending',
    license_type: 'proprietary',
    internal_notes: r.isReview ? 'Bulk import (flagged in _REVIEW)' : 'Bulk import',
    created_by: user?.id || null,
  })

  const handleImport = async () => {
    setPhase('importing')
    setProgress({ done: 0, total: importable.length })

    const ok = []
    const failed = []
    let done = 0

    for (let i = 0; i < importable.length; i += CHUNK_SIZE) {
      const chunk = importable.slice(i, i + CHUNK_SIZE)
      const records = chunk.map(buildRecord)
      const { data, error } = await supabase.from('bhajans').insert(records).select('id')

      if (!error && data && data.length === chunk.length) {
        ok.push(...chunk)
      } else {
        for (let j = 0; j < chunk.length; j++) {
          const { data: one, error: oneErr } = await supabase
            .from('bhajans')
            .insert(buildRecord(chunk[j]))
            .select('id')
          if (!oneErr && one && one.length) ok.push(chunk[j])
          else
            failed.push({
              ...chunk[j],
              importError: oneErr?.message || 'Insert returned no row (RLS blocked?)',
            })
          done++
          setProgress({ done, total: importable.length })
        }
        continue
      }
      done += chunk.length
      setProgress({ done, total: importable.length })
    }

    setSummary({
      ok,
      failed,
      skipped: rows.filter((r) => r.status === 'duplicate'),
      errored: rows.filter((r) => r.status === 'error'),
    })
    setPhase('done')
  }

  const reset = () => {
    setRows([])
    setSummary(null)
    setProgress({ done: 0, total: 0 })
    setPhase('idle')
  }

  return (
    <div className="import-container">
      <div className="import-card">
        <h1>Bulk Import Bhajans</h1>
        <p className="import-intro">
          Select a folder of converted <code>.docx</code> files, drag them here, or pick individual files.
          Each file becomes one <strong>draft</strong> bhajan, ready for you to review and publish.
        </p>

        {phase === 'idle' && (
          <div
            className={`import-picker ${isDragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              id="folder-input"
              className="folder-input"
              type="file"
              webkitdirectory
              multiple
              onChange={handlePick}
            />
            <input
              id="files-input"
              className="folder-input"
              type="file"
              accept=".docx"
              multiple
              onChange={(e) => processFiles(Array.from(e.target.files || []))}
            />
            <label htmlFor="folder-input" className="folder-label">
              <span className="folder-icon">📁</span>
              <span className="folder-text">Choose a folder of .docx files</span>
              <span className="folder-hint">or drag files/folders here, or click below for individual files</span>
            </label>
            <label htmlFor="files-input" className="files-label">
              Select individual .docx files
            </label>
          </div>
        )}

        {phase === 'parsing' && (
          <div className="import-progress">
            <Spinner label={`Reading files… ${progress.done}/${progress.total}`} />
          </div>
        )}

        {phase === 'preview' && (
          <>
            <div className="import-counts">
              <span className="count-chip ok">{counts.ok || 0} ready</span>
              <span className="count-chip warn">{counts.warn || 0} with warnings</span>
              <span className="count-chip dup">{counts.duplicate || 0} duplicates</span>
              <span className="count-chip err">{counts.error || 0} errors</span>
            </div>

            <div className="import-options">
              <label>
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                />
                Skip duplicates automatically
              </label>
            </div>

            <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>File</th>
                    <th>Date Modified</th>
                    <th>Title</th>
                    <th>Language</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`row-${r.status}`}>
                      <td className="row-status">{statusIcon(r.status)}</td>
                      <td className="row-file" title={r.relPath}>{r.fileName}</td>
                      <td className="row-date">{r.fileDate}</td>
                      <td>{r.title || <em>—</em>}</td>
                      <td>{r.data?.language || <em>—</em>}</td>
                      <td className="row-notes">{r.messages.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="import-actions">
              <button
                className="btn-primary"
                onClick={handleImport}
                disabled={!importable.length}
              >
                Import {importable.length} draft{importable.length === 1 ? '' : 's'}
                {skipDuplicates && counts.duplicate ? ` (skipping ${counts.duplicate} duplicate${counts.duplicate === 1 ? '' : 's'})` : ''}
              </button>
              <button className="btn-secondary" onClick={reset}>Cancel</button>
            </div>
          </>
        )}

        {phase === 'importing' && (
          <div className="import-progress">
            <Spinner label={`Importing… ${progress.done}/${progress.total}`} />
          </div>
        )}

        {phase === 'done' && summary && (
          <>
            <div className="import-counts">
              <span className="count-chip ok">{summary.ok.length} imported</span>
              <span className="count-chip dup">{summary.skipped.length} skipped (duplicate)</span>
              <span className="count-chip err">
                {summary.failed.length + summary.errored.length} not imported
              </span>
            </div>

            {(summary.failed.length > 0 || summary.errored.length > 0) && (
              <div className="import-table-wrap">
                <table className="import-table">
                  <thead>
                    <tr><th>File</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {summary.errored.map((r, i) => (
                      <tr key={`e${i}`} className="row-error">
                        <td className="row-file">{r.fileName}</td>
                        <td className="row-notes">{r.messages.join(', ')}</td>
                      </tr>
                    ))}
                    {summary.failed.map((r, i) => (
                      <tr key={`f${i}`} className="row-error">
                        <td className="row-file">{r.fileName}</td>
                        <td className="row-notes">{r.importError}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="import-actions">
              <button className="btn-primary" onClick={() => navigate('/dashboard')}>
                Go to Dashboard
              </button>
              <button className="btn-secondary" onClick={reset}>Import another folder</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function statusIcon(status) {
  if (status === 'ok') return '✅'
  if (status === 'warn') return '⚠️'
  if (status === 'duplicate') return '⏭️'
  return '❌'
}

export default BulkImport
