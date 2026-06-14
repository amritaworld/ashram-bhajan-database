import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { parseDocx, generateBhajanId } from '../utils/parseDocx'
import { enrichBhajan } from '../utils/excelEnrich'
import { firstStanza, firstLineKey, stanzaSimilarity } from '../utils/iast'
import Spinner from '../components/Spinner'
import { showAlert } from '../components/Dialog'
import '../styles/BulkImport.css'

const CHUNK_SIZE = 50

// Dedup thresholds (full-first-stanza similarity, 0-100).
// >= EXACT  → treat as an exact duplicate (auto-skippable).
// [POSSIBLE, EXACT) with the same first line → "possible duplicate":
//   first stanza matches but the song may diverge later — never auto-dropped,
//   surfaced for manual review with a per-row opt-in.
const DUP_EXACT = 92
const DUP_POSSIBLE = 65

// The stanza we key dedup on: English IAST pallavi (normalizeIAST absorbs
// diacritic/spelling drift across songbooks), falling back to the Malayalam
// pallavi when no IAST lyrics are present.
function dedupStanza(lyricsEnglish, lyricsMalayalam) {
  return firstStanza(lyricsEnglish) || firstStanza(lyricsMalayalam)
}

// Parse a stored bhajans.lyrics JSON string into { english, malayalam }.
function parseStoredLyrics(raw) {
  if (!raw) return { english: '', malayalam: '' }
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    return { english: obj.english || '', malayalam: obj.malayalam || '' }
  } catch {
    return { english: '', malayalam: '' }
  }
}

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
  // Row indices of "possible duplicates" the user has opted to import anyway.
  const [includePossible, setIncludePossible] = useState(() => new Set())

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
      showAlert('No .docx files found.')
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

    const existingSlugs = new Set()
    // Tier-1 bucket of existing DB bhajans: firstLineKey -> [{ name, stanza }]
    const dbIndex = new Map()
    try {
      const { data, error } = await supabase.from('bhajans').select('name, bhajan_id, lyrics')
      if (error) throw error
      for (const b of data || []) {
        if (b.bhajan_id) existingSlugs.add(b.bhajan_id)
        const { english, malayalam } = parseStoredLyrics(b.lyrics)
        const stanza = dedupStanza(english, malayalam)
        if (!stanza) continue
        const key = firstLineKey(stanza)
        if (!key) continue
        if (!dbIndex.has(key)) dbIndex.set(key, [])
        dbIndex.get(key).push({ name: b.name || '(untitled)', stanza })
      }
    } catch (err) {
      showAlert('Could not load existing bhajans: ' + err.message)
      setPhase('idle')
      return
    }

    const batchSlugs = new Set()
    const built = await Promise.all(parsed.map(async (p) => {
      if (p.parseError) {
        return { ...p, status: 'error', messages: [p.parseError] }
      }
      const title = (p.data.title || '').trim()
      const messages = []
      if (!title) {
        return { ...p, status: 'error', messages: ['No Title section found'] }
      }

      const base = generateBhajanId(title) || 'bhajan'
      let slug = base
      let n = 2
      while (existingSlugs.has(slug) || batchSlugs.has(slug)) slug = `${base}-${n++}`
      batchSlugs.add(slug)

      if (!p.data.language) messages.push('No language')
      if (!p.data.lyrics_malayalam && !p.data.lyrics_english) messages.push('No lyrics')
      if (p.isReview) messages.push('From _REVIEW')

      // Stanza used for duplicate detection (classified in the pass below)
      const stanza = dedupStanza(p.data.lyrics_english, p.data.lyrics_malayalam)

      // Auto-fill ONLY Theme and Year from the layamritam reference.
      // Raga and Tala are never auto-filled — they come from user input only.
      let enrichment = null
      try {
        const enriched = await enrichBhajan({ name: title })
        const keep = (enriched._enrichmentFields || []).filter((f) => f === 'theme' || f === 'year')
        if (enriched._enrichmentUsed && keep.length) {
          enrichment = {
            theme: keep.includes('theme') ? enriched.theme : null,
            year: keep.includes('year') ? enriched.year : null,
            reason: enriched._enrichmentConfidence >= 90 ? 'High confidence match' : 'Fuzzy match'
          }
          messages.push(`✨ Auto-filled (${keep.join(', ')})`)
        }
      } catch (err) {
        // Silently skip enrichment errors
        console.warn('Enrichment failed for', title, err)
      }

      return {
        ...p,
        title,
        slug,
        stanza,
        enrichment,
        status: messages.length ? 'warn' : 'ok',
        messages,
      }
    }))

    // Two-tier duplicate detection, run sequentially so within-batch order is
    // deterministic. Tier 1: bucket by normalized first line. Tier 2: full
    // first-stanza similarity. Checked against the existing DB AND earlier
    // files in this batch. Borderline matches are flagged "possible" (never
    // auto-dropped) — these are sacred texts that may share a pallavi but
    // diverge later.
    const batchIndex = new Map()
    const register = (key, name, stanza) => {
      if (!batchIndex.has(key)) batchIndex.set(key, [])
      batchIndex.get(key).push({ name, stanza })
    }
    for (const r of built) {
      if (r.status === 'error' || !r.stanza) continue
      const key = firstLineKey(r.stanza)
      if (!key) continue

      const candidates = [
        ...(dbIndex.get(key) || []).map((c) => ({ ...c, where: 'database' })),
        ...(batchIndex.get(key) || []).map((c) => ({ ...c, where: 'this batch' })),
      ]
      let best = null
      for (const c of candidates) {
        const score = stanzaSimilarity(r.stanza, c.stanza)
        if (!best || score > best.score) best = { ...c, score }
      }

      if (best && best.score >= DUP_EXACT) {
        // Exact duplicate: keep the first occurrence, don't register this one.
        r.status = 'duplicate'
        r.dupMatch = best
        r.messages = [`Duplicate of “${best.name}” in ${best.where} (${best.score}%)`, ...r.messages]
      } else if (best && best.score >= DUP_POSSIBLE) {
        r.status = 'possible'
        r.dupMatch = best
        r.messages = [`Possible duplicate of “${best.name}” in ${best.where} (${best.score}%)`, ...r.messages]
        register(key, r.title, r.stanza) // still a distinct bhajan — later files can match it
      } else {
        register(key, r.title, r.stanza)
      }
    }

    setRows(built)
    setPhase('preview')
  }

  const counts = rows.reduce(
    (acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc),
    {}
  )
  const importable = rows.filter((r, i) => {
    if (r.status === 'ok' || r.status === 'warn') return true
    if (r.status === 'duplicate') return !skipDuplicates
    if (r.status === 'possible') return includePossible.has(i)
    return false
  })

  const togglePossible = (i) => {
    setIncludePossible((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

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
    theme: r.enrichment?.theme || null,
    raga: null, // never auto-filled — user input only
    tala: null, // never auto-filled — user input only
    year: r.enrichment?.year || null,
    internal_notes: [
      r.isReview ? 'Bulk import (flagged in _REVIEW)' : 'Bulk import',
      r.enrichment?.reason ? `Auto-enriched: ${r.enrichment.reason}` : null,
      r.status === 'possible' && r.dupMatch
        ? `⚠️ Possible duplicate of "${r.dupMatch.name}" (${r.dupMatch.score}%) — review`
        : null,
    ].filter(Boolean).join(' | '),
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
      skipped: rows.filter((r) => r.status === 'duplicate' && skipDuplicates),
      possibleSkipped: rows.filter((r, i) => r.status === 'possible' && !includePossible.has(i)),
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
              <span className="folder-icon material-symbols-outlined">folder_open</span>
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
              <span className="count-chip possible">{counts.possible || 0} possible dupes</span>
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
                Skip exact duplicates automatically
              </label>
              {(counts.possible || 0) > 0 && (
                <p className="import-options-hint">
                  <span className="material-symbols-outlined" style={{ color: '#ffc107', verticalAlign: 'middle' }}>help</span> <strong>{counts.possible} possible duplicate{counts.possible === 1 ? '' : 's'}</strong> —
                  the first stanza matches an existing bhajan but the rest may differ. These are
                  left out by default; tick “import anyway” on a row to include it as a flagged draft.
                </p>
              )}
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
                      <td className="row-notes">
                        {r.messages.join(', ')}
                        {r.status === 'possible' && (
                          <label className="import-anyway">
                            <input
                              type="checkbox"
                              checked={includePossible.has(i)}
                              onChange={() => togglePossible(i)}
                            />
                            import anyway
                          </label>
                        )}
                      </td>
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
              {summary.possibleSkipped.length > 0 && (
                <span className="count-chip possible">
                  {summary.possibleSkipped.length} possible dupes left out
                </span>
              )}
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
  const map = {
    ok:        { icon: 'check_circle', color: '#4caf50' },
    warn:      { icon: 'warning',      color: '#ffc107' },
    possible:  { icon: 'help',         color: '#ffc107' },
    duplicate: { icon: 'skip_next',    color: '#9ca3af' },
  }
  const { icon, color } = map[status] || { icon: 'cancel', color: '#ef4444' }
  return <span className="material-symbols-outlined" style={{ color }}>{icon}</span>
}

export default BulkImport
