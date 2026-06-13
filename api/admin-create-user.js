// Secure server-side endpoint: an ADMIN creates a new user.
// Uses the Supabase service_role key (server-only — NEVER exposed to the
// browser) to create the auth account AND the matching public.users row.
// The caller must be a logged-in admin.
//
// This replaces the old browser-side signUp() flow, so we can turn OFF
// public sign-ups in Supabase without breaking user creation.
//
// Runs both as a Vercel serverless function and under local Vite dev (via
// the dev middleware in vite.config.js). Requires SUPABASE_SERVICE_ROLE_KEY.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xzjjelyvwwtwzirbuowj.supabase.co'
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IXJ2u6HkB261V4C4Sw05cQ_NwN7qTas'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const VALID_ROLES = ['viewer', 'contributor', 'admin']

function send(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(obj))
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

// Resolve the caller from their Supabase auth token.
async function verifyUser(token) {
  if (!token) return null
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
    })
    if (!r.ok) return null
    return await r.json() // { id, email, ... }
  } catch {
    return null
  }
}

// Is this user id an admin? Reads the `users` table with the service key.
async function isAdmin(userId) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=role`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    )
    if (!r.ok) return false
    const rows = await r.json()
    return rows?.[0]?.role === 'admin'
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
  if (!SERVICE_KEY) return send(res, 500, { error: 'SUPABASE_SERVICE_ROLE_KEY not configured on the server' })

  // Auth: caller must be a logged-in admin.
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const caller = await verifyUser(token)
  if (!caller) return send(res, 401, { error: 'Not authenticated' })
  if (!(await isAdmin(caller.id))) return send(res, 403, { error: 'Admins only' })

  let body
  try {
    body = await readBody(req)
  } catch {
    return send(res, 400, { error: 'Invalid JSON body' })
  }

  const email = (body.email || '').trim()
  const username = (body.username || '').trim().toLowerCase()
  const password = body.password || ''
  const displayName = (body.display_name || '').trim()
  const role = VALID_ROLES.includes(body.role) ? body.role : 'viewer'

  if (!email || !email.includes('@')) return send(res, 400, { error: 'A valid email is required' })
  if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    return send(res, 400, { error: 'Username must be at least 3 characters: letters, numbers, dot, underscore or hyphen' })
  }
  if (password.length < 6) return send(res, 400, { error: 'Password must be at least 6 characters' })

  // 1) Create the auth account (email pre-confirmed so they can log in now).
  let newUserId
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.id) {
      const msg = data?.msg || data?.error_description || data?.error || `status ${r.status}`
      return send(res, 502, { error: `Could not create login: ${msg}` })
    }
    newUserId = data.id
  } catch (e) {
    return send(res, 500, { error: 'Failed to create login', detail: String(e).slice(0, 200) })
  }

  // 2) Create the matching public.users row.
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        id: newUserId,
        email,
        username,
        display_name: displayName,
        role,
      }),
    })
    if (!r.ok) {
      const t = await r.text()
      // Roll back the auth account so we don't leave an orphan login.
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${newUserId}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        })
      } catch { /* best effort */ }
      return send(res, 502, { error: 'Could not save user profile', detail: t.slice(0, 300) })
    }
    return send(res, 200, { ok: true, userId: newUserId })
  } catch (e) {
    return send(res, 500, { error: 'Failed to save user profile', detail: String(e).slice(0, 200) })
  }
}
