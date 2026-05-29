import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'

function Dashboard() {
  const [bhajans, setBhajans] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchBhajans()
  }, [])

  const fetchBhajans = async () => {
    const { data } = await supabase
      .from('bhajans')
      .select('*')
      .order('created_at', { ascending: false })

    setBhajans(data || [])
    setLoading(false)
  }

  const handleDelete = async (id, name) => {
    if (window.confirm(`Delete "${name}"?`)) {
      await supabase.from('bhajans').delete().eq('id', id)
      fetchBhajans()
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Bhajans</h1>
      </div>

      <div className="bhajans-list">
        {loading ? (
          <p>Loading...</p>
        ) : bhajans.length === 0 ? (
          <p>No bhajans yet. Create one!</p>
        ) : (
          bhajans.map(bhajan => (
            <div key={bhajan.id} className="bhajan-item">
              <div className="bhajan-info">
                <h3>{bhajan.name}</h3>
                <p>{bhajan.theme || '-'} • {bhajan.raga || '-'} • {bhajan.tala || '-'}</p>
              </div>
              <div className="bhajan-actions">
                <button onClick={() => navigate(`/bhajan/${bhajan.id}/edit`)} className="btn-edit">Edit</button>
                <button onClick={() => handleDelete(bhajan.id, bhajan.name)} className="btn-delete">Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Dashboard
