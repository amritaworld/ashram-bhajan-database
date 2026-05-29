import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'
import '../styles/ActivityLog.css'

function ActivityLog({ bhajanId }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadActivities()
  }, [bhajanId])

  const loadActivities = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('activity_log')
        .select(`
          *,
          user:changed_by(display_name, email)
        `)
        .eq('bhajan_id', bhajanId)
        .order('created_at', { ascending: false })

      setActivities(data || [])
    } catch (err) {
      console.error('Error loading activities:', err)
    }
    setLoading(false)
  }

  const getActionIcon = (action) => {
    switch(action) {
      case 'created': return '✨'
      case 'updated': return '✏️'
      case 'deleted': return '🗑️'
      default: return '📝'
    }
  }

  const getActionColor = (action) => {
    switch(action) {
      case 'created': return '#4caf50'
      case 'updated': return '#2196f3'
      case 'deleted': return '#ff5c5c'
      default: return '#d6a84f'
    }
  }

  return (
    <div className="activity-log-container">
      <h3>Activity Log</h3>

      {loading ? (
        <div className="loading">Loading activities...</div>
      ) : activities.length === 0 ? (
        <div className="no-activities">No activities yet</div>
      ) : (
        <div className="activities-list">
          {activities.map(activity => (
            <div key={activity.id} className="activity-item">
              <div className="activity-icon" style={{ color: getActionColor(activity.action) }}>
                {getActionIcon(activity.action)}
              </div>
              <div className="activity-content">
                <div className="activity-header">
                  <span className="activity-action" style={{ color: getActionColor(activity.action) }}>
                    {activity.action.toUpperCase()}
                  </span>
                  <span className="activity-time">
                    {new Date(activity.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="activity-description">
                  {activity.description}
                </div>
                {activity.user && (
                  <div className="activity-user">
                    By: <strong>{activity.user.display_name || activity.user.email}</strong>
                  </div>
                )}
                {activity.changed_fields && activity.changed_fields.length > 0 && (
                  <div className="activity-fields">
                    Fields: {activity.changed_fields.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ActivityLog
