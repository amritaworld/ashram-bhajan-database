import { useState, useRef } from 'react'
import '../styles/TagInput.css'

// Single-value combobox: pick from a list OR type a custom value.
function ComboBox({ value = '', onChange, options = [], placeholder }) {
  const [open, setOpen] = useState(false)
  const blurTimer = useRef(null)

  const q = (value || '').toLowerCase().trim()
  const matches = options.filter(o => (q ? o.toLowerCase().includes(q) : true))
  const showAdd = q && !options.some(o => o.toLowerCase() === q)

  const choose = (val) => {
    onChange(val)
    setOpen(false)
  }

  return (
    <div className="tag-input-field">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
        placeholder={placeholder || 'Select or type...'}
        autoComplete="off"
      />
      {open && (matches.length > 0 || showAdd) && (
        <div className="tag-dropdown" onMouseDown={() => clearTimeout(blurTimer.current)}>
          {matches.map(o => (
            <button type="button" key={o} className="tag-option" onClick={() => choose(o)}>
              {o}
            </button>
          ))}
          {showAdd && (
            <button type="button" className="tag-option tag-option-add" onClick={() => choose(value.trim())}>
              + Use "{value.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ComboBox
