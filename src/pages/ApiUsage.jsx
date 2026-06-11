import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'

function ApiUsage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('api_usage')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) setError(error.message)
    else setRows(data || [])
    setLoading(false)
  }

  const totalCalls = rows.length
  const okCalls = rows.filter((r) => r.status === 'ok').length
  const totalTokens = rows.reduce((s, r) => s + (r.prompt_tokens || 0) + (r.output_tokens || 0), 0)
  const totalCost = rows.reduce((s, r) => s + Number(r.cost_inr || 0), 0)

  const fmtDate = (d) =>
    new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>API Calls</h1>
        <button onClick={load} className="nav-link" style={{ border: '1px solid #c08a2b', borderRadius: 6, padding: '0.35rem 0.8rem', color: '#c08a2b', background: 'transparent', cursor: 'pointer' }}>
          ⟳ Refresh
        </button>
      </div>
      <p style={{ color: '#888', marginTop: 0 }}>
        AI usage from the in-app “Generate meanings” feature. (The one-time bulk
        conversion was run outside the app and isn’t counted here.)
      </p>

      {error && <p style={{ color: '#c0392b' }}>Error: {error}</p>}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', margin: '1.25rem 0' }}>
        {[
          { label: 'Total cost', value: `₹${totalCost.toFixed(2)}`, accent: true },
          { label: 'API calls', value: totalCalls },
          { label: 'Successful', value: okCalls },
          { label: 'Total tokens', value: totalTokens.toLocaleString('en-IN') },
        ].map((c) => (
          <div key={c.label} style={{ border: '1px solid #eadfc4', borderRadius: 10, padding: '1rem', background: '#fffdf8' }}>
            <div style={{ fontSize: '0.8rem', color: '#998', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: c.accent ? '#c08a2b' : '#333' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Call log */}
      <h2 style={{ fontSize: '1.05rem' }}>Recent calls</h2>
      {loading ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#888' }}>No API calls recorded yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #eadfc4', color: '#776' }}>
                <th style={{ padding: '0.5rem' }}>When</th>
                <th style={{ padding: '0.5rem' }}>User</th>
                <th style={{ padding: '0.5rem' }}>Feature</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Tokens</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Cost (₹)</th>
                <th style={{ padding: '0.5rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0ead9' }}>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                  <td style={{ padding: '0.5rem' }}>{r.user_email || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{r.feature}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    {((r.prompt_tokens || 0) + (r.output_tokens || 0)).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>{Number(r.cost_inr || 0).toFixed(3)}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <span style={{ color: r.status === 'ok' ? '#27893f' : '#c0392b' }}>
                      {r.status === 'ok' ? '✓ ok' : '✕ error'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default ApiUsage
