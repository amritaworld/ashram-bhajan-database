import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../config/supabase'
import '../styles/Admin.css'

// A separate client used only to sign up new users, so creating a user
// does NOT replace the logged-in admin's session.
const signupClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

function UserManagement({ user }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    display_name: '',
    role: 'viewer'
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
      password: '',
      display_name: '',
      role: 'viewer'
    })
    setEditingId(null)
    setShowForm(false)
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()

    if (!formData.email) {
      alert('Please fill in all required fields')
      return
    }

    setLoading(true)
    try {
      if (editingId) {
        await supabase
          .from('users')
          .update({
            display_name: formData.display_name,
            role: formData.role
          })
          .eq('id', editingId)
        alert('User updated successfully!')
      } else {
        if (!formData.password) {
          alert('Please enter password for new user')
          setLoading(false)
          return
        }

        const { data: signUpData, error: authError } = await signupClient.auth.signUp({
          email: formData.email,
          password: formData.password
        })

        if (authError) throw authError
        const newUserId = signUpData.user?.id
        if (!newUserId) throw new Error('User could not be created')

        const { error: dbError } = await supabase
          .from('users')
          .insert([{
            id: newUserId,
            email: formData.email,
            display_name: formData.display_name,
            role: formData.role
          }])

        if (dbError) throw dbError
        alert('User created successfully!')
      }

      resetForm()
      await fetchUsers()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEditUser = (userData) => {
    setFormData({
      email: userData.email,
      password: '',
      display_name: userData.display_name || '',
      role: userData.role
    })
    setEditingId(userData.id)
    setShowForm(true)
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
        <div className="loading">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="no-results">No users found. Create one to get started!</div>
      ) : (
        <div className="users-table">
          <table>
            <thead>
              <tr>
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
