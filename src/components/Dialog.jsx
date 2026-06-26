import { useState, useEffect, useRef } from 'react'
import '../styles/Dialog.css'

// Centered, in-app replacement for window.alert / window.confirm.
// Usage:
//   import { showAlert, showConfirm } from '../components/Dialog'
//   showAlert('Saved!')                          // fire-and-forget
//   if (await showConfirm('Delete this?', { confirmText: 'Delete', danger: true })) { ... }
// A single <DialogHost /> must be mounted once (in App).

const queue = []
let notify = null

function enqueue(item) {
  return new Promise((resolve) => {
    queue.push({ ...item, resolve })
    if (notify) notify()
  })
}

export function showAlert(message, { title = '', confirmText = 'OK' } = {}) {
  return enqueue({ type: 'alert', message, title, confirmText })
}

export function showConfirm(message, {
  title = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
} = {}) {
  return enqueue({ type: 'confirm', message, title, confirmText, cancelText, danger })
}

// Centered, auto-dismissing toast (non-blocking). For success confirmations
// like "Bhajan Saved". Independent of the alert/confirm queue.
let pushToast = null
export function showToast(message, { duration = 1600, icon = 'check_circle' } = {}) {
  if (pushToast) pushToast(message, { duration, icon })
}

export function DialogHost() {
  const [, force] = useState(0)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  useEffect(() => {
    notify = () => force((n) => n + 1)
    notify()
    return () => { notify = null }
  }, [])

  useEffect(() => {
    pushToast = (message, { duration, icon }) => {
      setToast({ message, icon })
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), duration)
    }
    return () => { pushToast = null; clearTimeout(toastTimer.current) }
  }, [])

  const current = queue[0]

  const close = (result) => {
    current.resolve(result)
    queue.shift()
    force((n) => n + 1)
  }

  useEffect(() => {
    if (!current) return
    const onKey = (e) => {
      if (e.key === 'Escape') close(current.type === 'confirm' ? false : undefined)
      if (e.key === 'Enter') close(current.type === 'confirm' ? true : undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  const isConfirm = current?.type === 'confirm'

  return (
    <>
      {toast && (
        <div className="toast-overlay" aria-live="polite">
          <div className="toast-box">
            <span className="material-symbols-outlined toast-icon">{toast.icon}</span>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}

      {current && (
        <div
          className="dialog-overlay"
          onClick={() => close(isConfirm ? false : undefined)}
        >
          <div
            className="dialog-box"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {current.title && <h3 className="dialog-title">{current.title}</h3>}
            <p className="dialog-message">{current.message}</p>
            <div className="dialog-actions">
              {isConfirm && (
                <button className="dialog-btn dialog-cancel" onClick={() => close(false)}>
                  {current.cancelText}
                </button>
              )}
              <button
                className={`dialog-btn ${isConfirm && current.danger ? 'dialog-danger' : 'dialog-primary'}`}
                onClick={() => close(isConfirm ? true : undefined)}
                autoFocus
              >
                {current.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default DialogHost
