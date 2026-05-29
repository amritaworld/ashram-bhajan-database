import { useState } from 'react'
import ActivityLog from './ActivityLog'
import '../styles/BhajanDetailsModal.css'

function BhajanDetailsModal({ bhajan, onClose }) {
  if (!bhajan) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{bhajan.name}</h2>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>

        <div className="modal-body">
          <div className="bhajan-details">
            <div className="detail-row">
              <span className="detail-label">Theme:</span>
              <span className="detail-value">{bhajan.theme || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Raga:</span>
              <span className="detail-value">{bhajan.raga || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Tala:</span>
              <span className="detail-value">{bhajan.tala || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Duration:</span>
              <span className="detail-value">{bhajan.duration_minutes ? `${bhajan.duration_minutes} min` : '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Year:</span>
              <span className="detail-value">{bhajan.year_of_recording || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className={`status-badge status-${bhajan.status}`}>
                {bhajan.status.toUpperCase()}
              </span>
            </div>
          </div>

          <ActivityLog bhajanId={bhajan.id} />
        </div>
      </div>
    </div>
  )
}

export default BhajanDetailsModal
