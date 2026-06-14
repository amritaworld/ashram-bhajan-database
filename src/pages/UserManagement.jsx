import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'
import Spinner from '../components/Spinner'
import { showAlert, showConfirm } from '../components/Dialog'
import '../styles/Admin.css'

function UserManagement({ user }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    display_name: '',
    role: 'viewer',
    newPassword: ''
  })
  const [editingId, setEditingId] = useState(null)

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

  const resetForm = () => {
    setFormData({
      email: '',
      username: '',
      password: '',
      display_name: '',
      role: 'viewer',
      newPassword: ''
    })
    setEditingId(null)
    setShowForm(false)
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()

    if (!formData.email) {
      showAlert('Please fill in all required fields')
      return
    }

    // Username is required (it's what people log in with) and must be unique.
    const username = (formData.username || '').trim().toLowerCase()
    if (!username) {
      showAlert('Please enter a username (this is what the user logs in with)')
      return
    }
    if (!/^[a-z0-9._-]{3,}$/.test(username)) {
      showAlert('Username must be at least 3 characters: only letters, numbers, dot, underscore or hyphen')
      return
    }
    const taken = users.find(u => (u.username || '').toLowerCase() === username && u.id !== editingId)
    if (taken) {
      showAlert(`The username "${username}" is already taken`)
      return
    }

    setLoading(true)
    try {
      if (editingId) {
        await supabase
          .from('users')
          .update({
            username,
            display_name: formData.display_name,
            role: formData.role
          })
          .eq('id', editingId)

        // Optional: reset this user's password (admin sets it directly via the
        // secure server endpoint, which uses the service_role key).
        if (formData.newPassword) {
          if (formData.newPassword.length < 8) {
            showAlert('New password must be at least 8 characters')
            setLoading(false)
            return
          }
          const { data: { session } } = await supabase.auth.getSession()
          const res = await fetch('/api/admin-reset-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({ userId: editingId, newPassword: formData.newPassword })
          })
          const out = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(out.error || 'Password reset failed')
          showAlert('User updated and password reset. Tell the user their new password — they are not emailed.')
        } else {
          showAlert('User updated successfully!')
        }
      } else {
        if (!formData.password) {
          showAlert('Please enter password for new user')
          setLoading(false)
          return
        }

        // Create the user via the secure server endpoint (uses the service
        // key, admin-only). This lets us keep public sign-ups switched OFF.
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/admin-create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({
            email: formData.email,
            username,
            password: formData.password,
            display_name: formData.display_name,
            role: formData.role
          })
        })
        const out = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(out.error || 'User could not be created')
        showAlert('User created successfully!')
      }

      resetForm()
      await fetchUsers()
    } catch (err) {
      showAlert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEditUser = (userData) => {
    setFormData({
      email: userData.email,
      username: userData.username || '',
      password: '',
      display_name: userData.display_name || '',
      role: userData.role,
      newPassword: ''
    })
    setEditingId(userData.id)
    setShowForm(true)
  }

  const handleDeleteUser = async (userId, userEmail) => {
    if (userId === user.id) {
      showAlert('You cannot delete your own account')
      return
    }

    if (await showConfirm(`Delete user ${userEmail}? This removes their login completely.`, { title: 'Delete user', confirmText: 'Delete', danger: true })) {
      try {
        // Delete via the secure server endpoint (service key, admin-only) so
        // BOTH the login and the profile row are removed. The old browser
        // delete only removed the profile, leaving the email still "taken".
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/admin-delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ userId })
        })
        const out = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(out.error || 'Delete failed')
        await fetchUsers()
        showAlert('User deleted successfully')
      } catch (err) {
        showAlert('Error deleting user: ' + err.message)
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
          <h2>{editingId ? 'Edit User' : 'Create New User'}</h2>
          <form onSubmit={handleCreateUser}>
            <div className="form-group">
              <label>Email {!editingId && '*'}</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="user@example.com"
                disabled={!!editingId}
                required={!editingId}
              />
            </div>

            <div className="form-group">
              <label>Username *</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                placeholder="e.g. hari"
                autoCapitalize="none"
                autoCorrect="off"
                required
              />
              <small style={{ color: '#9ca3af', display: 'block', marginTop: '0.4rem' }}>
                This is what the user types to log in. Letters, numbers, dot, underscore or hyphen.
              </small>
            </div>

            {!editingId && (
              <div className="form-group">
                <label>Password *</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Enter password"
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label>Display Name</label>
              <input
                type="text"
                name="display_name"
                value={formData.display_name}
                onChange={handleInputChange}
                placeholder="e.g., Hari Brahmachari"
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

            {editingId && (
              <div className="form-group">
                <label>Reset Password (optional)</label>
                <input
                  type="password"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleInputChange}
                  placeholder="Type a new password to reset it"
                  autoComplete="new-password"
                />
                <small style={{ color: '#9ca3af', display: 'block', marginTop: '0.4rem' }}>
                  Leave blank to keep the current password. The user is <strong>not</strong> emailed —
                  tell them the new password yourself.
                </small>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Saving...' : editingId ? 'Update User' : 'Create User'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading users" />
      ) : users.length === 0 ? (
        <div className="no-results">No users found. Create one to get started!</div>
      ) : (
        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.username || '-'}</strong></td>
                  <td>{u.email}</td>
                  <td>{u.display_name || '-'}</td>
                  <td>
                    <span className={`badge badge-${u.role}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => handleEditUser(u)}
                      className="action-link"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.id, u.email)}
                      className="action-link delete"
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
