import { useRef, useEffect } from 'react'

// A textarea that grows to fit its content (no inner scrollbar for normal
// lengths), capped by maxHeight after which it scrolls. minHeight keeps empty
// boxes a sensible size. Drop-in replacement for <textarea> — pass value,
// onChange, placeholder, className, etc. as usual.
function AutoTextarea({ value, minHeight = '5rem', maxHeight = '60vh', style, onInput, ...props }) {
  const ref = useRef(null)

  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'              // reset so scrollHeight reflects content
    el.style.height = `${el.scrollHeight}px`
  }

  // Re-fit whenever the value changes (typing, sync, find & replace, load).
  useEffect(() => { resize() }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onInput={(e) => { resize(); onInput && onInput(e) }}
      style={{ minHeight, maxHeight, overflowY: 'auto', resize: 'vertical', ...style }}
      {...props}
    />
  )
}

export default AutoTextarea
