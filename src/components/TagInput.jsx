import { useState, useRef } from 'react'
import '../styles/TagInput.css'

function TagInput({ value = [], onChange, options = [], placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef(null)

  const selected = value.filter(Boolean)
  const q = query.toLowerCase().trim()

  const matches = options
    .filter(o => !selected.some(s => s.toLowerCase() === o.toLowerCase()))
    .filter(o => (q ? o.toLowerCase().includes(q) : true))
    .slice(0, 8)

  const add = (val) => {
    const trimmed = val.trim()
    if (!trimmed) return
    if (!selected.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...selected, trimmed])
    }
    setQuery('')
  }

  const remove = (val) => onChange(selected.filter(s => s !== val))

  const showAddOption = q && !options.some(o => o.toLowerCase() === q) && !selected.some(s => s.toLowerCase() === q)

  return (
    <div className="tag-input">
      {selected.length > 0 && (
        <div className="tag-chips">
          {selected.map(v => (
            <span className="tag-chip" key={v}>
              {v}
              <button
                type="button"
                className="tag-chip-remove"
                onClick={() => remove(v)}
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="tag-input-field">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(query) }
            if (e.key === 'Backspace' && !query && selected.length) remove(selected[selected.length - 1])
          }}
          placeholder={placeholder || 'Type or select...'}
          autoComplete="off"
        />
        {open && (matches.length > 0 || showAddOption) && (
          <div className="tag-dropdown" onMouseDown={() => clearTimeout(blurTimer.current)}>
            {matches.map(o => (
              <button type="button" key={o} className="tag-option" onClick={() => add(o)}>
                {o}
              </button>
            ))}
            {showAddOption && (
              <button type="button" className="tag-option tag-option-add" onClick={() => add(query)}>
                + Add "{query.trim()}"
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TagInput
