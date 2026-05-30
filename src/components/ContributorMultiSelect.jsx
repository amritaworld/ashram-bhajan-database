import { useState, useRef } from 'react'
import '../styles/ContributorMultiSelect.css'

function ContributorMultiSelect({ value = [], onChange, contributors = [], placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef(null)

  const selected = value.filter(Boolean)
  const q = query.toLowerCase().trim()

  const matches = contributors
    .filter(c => !selected.some(s => s.toLowerCase() === c.name.toLowerCase()))
    .filter(c => (q ? c.name.toLowerCase().includes(q) : true))
    .slice(0, 8)

  const add = (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (selected.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setQuery('')
      return
    }
    onChange([...selected, trimmed])
    setQuery('')
  }

  const remove = (name) => {
    onChange(selected.filter(s => s !== name))
  }

  return (
    <div className="contrib-multi">
      {selected.length > 0 && (
        <div className="contrib-chips">
          {selected.map(name => (
            <span className="contrib-chip" key={name}>
              {name}
              <button
                type="button"
                className="contrib-chip-remove"
                onClick={() => remove(name)}
                title={`Remove ${name}`}
                aria-label={`Remove ${name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="contrib-multi-input">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(query) }
            if (e.key === 'Backspace' && !query && selected.length) {
              remove(selected[selected.length - 1])
            }
          }}
          placeholder={placeholder || 'Search contributors...'}
          autoComplete="off"
        />
        {open && (
          <div
            className="contrib-search-dropdown"
            onMouseDown={() => clearTimeout(blurTimer.current)}
          >
            {matches.length > 0 ? (
              matches.map(c => (
                <button
                  type="button"
                  key={c.id}
                  className="contrib-search-option"
                  onClick={() => add(c.name)}
                >
                  <span className="contrib-search-name">{c.name}</span>
                  {c.email && <span className="contrib-search-meta">{c.email}</span>}
                </button>
              ))
            ) : (
              <div className="contrib-search-empty">
                {q
                  ? 'No registered contributor matches.'
                  : 'No more registered contributors.'}
              </div>
            )}
            {q && !contributors.some(c => c.name.toLowerCase() === q) && (
              <button
                type="button"
                className="contrib-search-option contrib-search-add"
                onClick={() => add(query)}
              >
                + Add "{query.trim()}"
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ContributorMultiSelect
