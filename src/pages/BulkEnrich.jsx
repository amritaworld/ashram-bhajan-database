import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Spinner from '../components/Spinner'
import { matchExcelWithBhajans, applyEnrichment } from '../utils/excelEnrich'
import '../styles/BulkEnrich.css'

function BulkEnrich() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('idle') // idle | parsing | preview | applying | done
  const [excelRows, setExcelRows] = useState([])
  const [matches, setMatches] = useState([])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setPhase('parsing')

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(worksheet)

      if (rows.length === 0) {
        alert('No data found in Excel file')
        setPhase('idle')
        setLoading(false)
        return
      }

      setExcelRows(rows)

      // Match with database
      setPhase('parsing')
      const matchResults = await matchExcelWithBhajans(rows)
      setMatches(matchResults)
      setPhase('preview')
    } catch (err) {
      alert('Error reading Excel: ' + err.message)
      setPhase('idle')
    }

    setLoading(false)
  }

  const handleApplyEnrichment = async () => {
    setLoading(true)
    setPhase('applying')

    try {
      const enrichResults = await applyEnrichment(matches)
      setResults(enrichResults)
      setPhase('done')
    } catch (err) {
      alert('Error applying enrichment: ' + err.message)
      setPhase('preview')
    }

    setLoading(false)
  }

  const reset = () => {
    setPhase('idle')
    setExcelRows([])
    setMatches([])
    setResults(null)
  }

  const confidentMatches = matches.filter(m => m.confidence >= 70)
  const lowConfidenceMatches = matches.filter(m => m.confidence > 0 && m.confidence < 70)
  const noMatches = matches.filter(m => m.confidence === 0)

  return (
    <div className="enrich-container">
      <div className="enrich-card">
        <h1>Enrich Bhajans from Excel</h1>
        <p className="enrich-intro">
          Upload your <code>LayamritamSongs.xlsx</code> to automatically fill in missing
          theme (deity), raga, tala, and year for draft bhajans.
        </p>

        {phase === 'idle' && (
          <div className="file-upload-area">
            <input
              id="excel-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={loading}
              className="file-input"
            />
            <label htmlFor="excel-upload" className="file-label">
              <span className="file-icon">📊</span>
              <span className="file-text">Click to upload Excel file</span>
              <span className="file-hint">LayamritamSongs.xlsx</span>
            </label>
          </div>
        )}

        {phase === 'parsing' && (
          <div className="enrich-progress">
            <Spinner label="Reading Excel and matching with database..." />
          </div>
        )}

        {phase === 'preview' && (
          <>
            <div className="match-summary">
              <span className="match-chip confident">
                {confidentMatches.length} confident matches (≥70%)
              </span>
              <span className="match-chip low">
                {lowConfidenceMatches.length} low confidence (50-69%)
              </span>
              <span className="match-chip none">
                {noMatches.length} no match
              </span>
            </div>

            <div className="enrich-table-wrap">
              <table className="enrich-table">
                <thead>
                  <tr>
                    <th>Confidence</th>
                    <th>Excel Title</th>
                    <th>Matched Bhajan</th>
                    <th>Updates</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match, i) => (
                    <tr key={i} className={getRowClass(match.confidence)}>
                      <td className="confidence-cell">
                        <span className="confidence-badge">{match.confidence}%</span>
                      </td>
                      <td className="title-cell">{match.excelRow.Title}</td>
                      <td className="matched-cell">
                        {match.bhajanMatch ? (
                          <>
                            <div>{match.bhajanMatch.name}</div>
                            <div className="existing-data">
                              {match.bhajanMatch.theme && <span>theme: {match.bhajanMatch.theme}</span>}
                              {match.bhajanMatch.raga && <span>raga: {match.bhajanMatch.raga}</span>}
                            </div>
                          </>
                        ) : (
                          <em>—</em>
                        )}
                      </td>
                      <td className="updates-cell">
                        {match.bhajanMatch && (
                          <ul>
                            {match.excelRow.Deity && <li>theme: {match.excelRow.Deity}</li>}
                            {match.excelRow.Raagam && !match.bhajanMatch.raga && (
                              <li>raga: {match.excelRow.Raagam}</li>
                            )}
                            {match.excelRow.Taalam && !match.bhajanMatch.tala && (
                              <li>tala: {match.excelRow.Taalam}</li>
                            )}
                            {match.excelRow.RecordingYear && !match.bhajanMatch.year && (
                              <li>year: {match.excelRow.RecordingYear}</li>
                            )}
                          </ul>
                        )}
                      </td>
                      <td className="reason-cell">{match.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="enrich-actions">
              <button
                className="btn-primary"
                onClick={handleApplyEnrichment}
                disabled={confidentMatches.length === 0}
              >
                Apply {confidentMatches.length} Enrichments
              </button>
              <button className="btn-secondary" onClick={reset}>
                Cancel
              </button>
            </div>
          </>
        )}

        {phase === 'applying' && (
          <div className="enrich-progress">
            <Spinner label="Applying enrichments..." />
          </div>
        )}

        {phase === 'done' && results && (
          <>
            <div className="results-summary">
              <span className="result-chip success">✅ {results.success.length} updated</span>
              <span className="result-chip error">❌ {results.failed.length} failed</span>
              <span className="result-chip skip">⏭️ {results.skipped} skipped</span>
            </div>

            {results.success.length > 0 && (
              <div className="results-list">
                <h3>✅ Successfully Enriched</h3>
                <ul>
                  {results.success.slice(0, 10).map((r, i) => (
                    <li key={i}>{r.title} ({r.updated.join(', ')})</li>
                  ))}
                  {results.success.length > 10 && <li>... and {results.success.length - 10} more</li>}
                </ul>
              </div>
            )}

            {results.failed.length > 0 && (
              <div className="results-list error">
                <h3>❌ Failed</h3>
                <ul>
                  {results.failed.map((r, i) => (
                    <li key={i}>{r.title}: {r.error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="enrich-actions">
              <button className="btn-primary" onClick={() => navigate('/dashboard')}>
                Go to Dashboard
              </button>
              <button className="btn-secondary" onClick={reset}>
                Enrich Another File
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function getRowClass(confidence) {
  if (confidence >= 70) return 'row-confident'
  if (confidence > 0) return 'row-low'
  return 'row-none'
}

export default BulkEnrich
