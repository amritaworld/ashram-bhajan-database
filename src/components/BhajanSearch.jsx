import { useState, useRef, useEffect } from 'react'
import { supabase } from '../config/supabase'
import '../styles/TagInput.css'

/**
 * Search for bhajans by name/language
 * Fetches from Supabase as user types
 * Used for selecting "original bhajan" in tune groups
 */
function BhajanSearch({ value, onChange, excludeId, placeholder = 'Search original bhajan by name...' }) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const blurTimer = useRef(null)

  // When value changes (e.g., loading a saved bhajan), fetch its name
  useEffect(() => {
    if (value) {
      fetchBhajanName(value)
    } else {
      setSelectedName('')
    }
  }, [value])

  const fetchBhajanName = async (bhajanId) => {
    try {
      const { data, error } = await supabase
        .from('bhajans')
        .select('name, language')
        .eq('id', bhajanId)
        .single()

      if (error) throw error
      if (data) {
        setSelectedName(`${data.name} (${data.language})`)
      }
    } catch (err) {
      console.error('Error fetching bhajan name:', err)
    }
  }

  // Fetch bhajans matching the search query
  const searchBhajans = async (q) => {
    if (!q || q.length < 1) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      let query = supabase
        .from('bhajans')
        .select('id, name, language')
        .ilike('name', `%${q}%`) // Case-insensitive search

      // Only exclude self if excludeId is provided
      if (excludeId) {
        query = query.neq('id', excludeId)
      }

      const { data, error } = await query.limit(20)

      if (error) throw error

      setResults(
        (data || []).map(b => ({
          id: b.id,
          displayName: `${b.name} (${b.language})`,
          name: b.name,
          language: b.language
        }))
      )
    } catch (err) {
      console.error('Error searching bhajans:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Debounce search: wait 300ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        searchBhajans(query)
      } else {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const choose = (bhajanId, displayName) => {
    onChange(bhajanId)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const clear = () => {
    onChange('')
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div className="tag-input-field">
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="text"
          value={selectedName || query}
          onChange={(e) => {
            const val = e.target.value
            setQuery(val)
            if (val) setOpen(true)
          }}
          onFocus={() => {
            if (!selectedName) setOpen(true)
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150)
          }}
          placeholder={placeholder}
          autoComplete="off"
          style={{ flex: 1 }}
        />
        {selectedName && (
          <button
            type="button"
            onClick={clear}
            style={{
              padding: '0.4rem 0.6rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: '#2a2a30',
              color: '#9ca3af',
              border: '1px solid #1c1c22',
              borderRadius: '0.3rem'
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {open && (query || selectedName) && (
        <div className="tag-dropdown" onMouseDown={() => clearTimeout(blurTimer.current)}>
          {loading && (
            <div style={{ padding: '0.5rem', color: '#6b7280', fontSize: '0.85rem' }}>
              Searching...
            </div>
          )}
          {!loading && results.length === 0 && query && (
            <div style={{ padding: '0.5rem', color: '#6b7280', fontSize: '0.85rem' }}>
              No bhajans found matching "{query}"
            </div>
          )}
          {results.map(b => (
            <button
              type="button"
              key={b.id}
              className="tag-option"
              onClick={() => choose(b.id, b.displayName)}
            >
              {b.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default BhajanSearch
