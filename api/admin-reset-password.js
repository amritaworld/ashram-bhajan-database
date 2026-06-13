// Secure server-side endpoint: an ADMIN sets a new password for another user.
// Uses the Supabase service_role key (server-only — NEVER exposed to the
// browser) to call the Supabase Admin API. The caller must be a logged-in admin.
//
// Runs both as a Vercel serverless function and under local Vite dev (via the
// dev middleware in vite.config.js). Requires env var SUPABASE_SERVICE_ROLE_KEY.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xzjjelyvwwtwzirbuowj.supabase.co'
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IXJ2u6HkB261V4C4Sw05cQ_NwN7qTas'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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
  const userId = (body.userId || '').trim()
  const newPassword = body.newPassword || ''
  if (!userId) return send(res, 400, { error: 'Missing userId' })
  if (newPassword.length < 8) return send(res, 400, { error: 'Password must be at least 8 characters' })

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    })
    if (!r.ok) {
      const t = await r.text()
      return send(res, 502, { error: `Supabase admin error ${r.status}`, detail: t.slice(0, 300) })
    }
    return send(res, 200, { ok: true })
  } catch (e) {
    return send(res, 500, { error: 'Failed to reset password', detail: String(e).slice(0, 200) })
  }
}
