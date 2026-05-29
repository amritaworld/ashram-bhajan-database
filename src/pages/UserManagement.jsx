import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'
import '../styles/Admin.css'

function UserManagement({ user }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'viewer'
  })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) {
      setUsers(data || [])
    }
    setLoading(false)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()

    if (!formData.email || !formData.password) {
      alert('Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      const { data: { user: newUser }, error: authError } = await supabase.auth.admin.createUser({
        email: formData.email,
        password: formData.password,
        email_confirm: true
      })

      if (authError) throw authError

      const { error: dbError } = await supabase
        .from('users')
        .insert([{
          id: newUser.id,
          email: formData.email,
          role: formData.role
        }])

      if (dbError) throw dbError

      alert('User created successfully!')
      setFormData({ email: '', password: '', role: 'viewer' })
      setShowForm(false)
      await fetchUsers()
    } catch (err) {
      alert('Error creating user: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (userId, userEmail) => {
    if (userId === user.id) {
      alert('You cannot delete your own account')
      return
    }

    if (window.confirm(`Delete user ${userEmail}?`)) {
      try {
        await supabase.from('users').delete().eq('id', userId)
        await fetchUsers()
        alert('User deleted successfully')
      } catch (err) {
        alert('Error deleting user: ' + err.message)
      }
    }
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>User Management</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? 'Cancel' : '+ Create User'}
        </button>
      </div>

      {showForm && (
        <div className="admin-form">
          <h2>Create New User</h2>
          <form onSubmit={handleCreateUser}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="user@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Enter password"
                required
              />
            </div>

            <div className="form-group">
              <label>Role</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
              >
                <option value="viewer">Viewer</option>
                <option value="contributor">Contributor</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Creating...' : 'Create User'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="no-results">No users found. Create one to get started!</div>
      ) : (
        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <span className={`badge badge-${u.role}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => handleDeleteUser(u.id, u.email)}
                      className="btn-delete"
                      disabled={u.id === user.id}
                      title={u.id === user.id ? 'Cannot delete own account' : 'Delete user'}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default UserManagement
