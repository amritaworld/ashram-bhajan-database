import { useState } from 'react'
import '../styles/SelectOrCreate.css'

const ADD_NEW = '__add_new__'

function SelectOrCreate({ label, value, options = [], onChange, placeholder }) {
  const [creating, setCreating] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [created, setCreated] = useState([])

  // Merge provided options, any values created this session, and the current
  // value (so legacy/just-saved values always remain selectable).
  const allOptions = [...new Set([...options, ...created, ...(value ? [value] : [])])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  const handleSelectChange = (e) => {
    if (e.target.value === ADD_NEW) {
      setCreating(true)
      setNewValue('')
    } else {
      onChange(e.target.value)
    }
  }

  const handleAdd = () => {
    const trimmed = newValue.trim()
    if (!trimmed) return
    if (!allOptions.includes(trimmed)) {
      setCreated(prev => [...prev, trimmed])
    }
    onChange(trimmed)
    setCreating(false)
    setNewValue('')
  }

  const handleCancel = () => {
    setCreating(false)
    setNewValue('')
  }

  if (creating) {
    return (
      <div className="soc-create-row">
        <input
          autoFocus
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleAdd() }
            if (e.key === 'Escape') handleCancel()
          }}
          placeholder={`New ${label.toLowerCase()}...`}
        />
        <button type="button" className="btn-secondary soc-btn" onClick={handleAdd}>Add</button>
        <button type="button" className="btn-secondary soc-btn" onClick={handleCancel}>Cancel</button>
      </div>
    )
  }

  return (
    <select value={value || ''} onChange={handleSelectChange}>
      <option value="">{placeholder || `Select ${label.toLowerCase()}...`}</option>
      {allOptions.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
      <option value={ADD_NEW}>+ Add new {label.toLowerCase()}...</option>
    </select>
  )
}

export default SelectOrCreate
