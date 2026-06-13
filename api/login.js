// Secure server-side endpoint: log in with a USERNAME.
// Supabase only authenticates by email, so this resolves the username to its
// email (using the service_role key, server-only) and then performs the normal
// password sign-in, returning the session tokens for the browser to adopt.
// Errors are deliberately generic so usernames/emails can't be probed.
//
// Runs as a Vercel function and under local Vite dev (vite.config.js middleware).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xzjjelyvwwtwzirbuowj.supabase.co'
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IXJ2u6HkB261V4C4Sw05cQ_NwN7qTas'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Lightweight in-memory rate limiter — best-effort defense-in-depth on top
// of Supabase's own auth rate limiting. State lives per warm serverless
// instance, so it slows naive brute-forcing without extra infrastructure.
const ATTEMPTS = new Map() // ip -> [timestamps]
const WINDOW_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 10
function clientIp(req) {
  const xff = req.headers['x-forwarded-for']
  if (xff) return String(xff).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}
function tooManyAttempts(ip) {
  const now = Date.now()
  const recent = (ATTEMPTS.get(ip) || []).filter(t => now - t < WINDOW_MS)
  recent.push(now)
  ATTEMPTS.set(ip, recent)
  if (ATTEMPTS.size > 5000) {
    for (const [k, v] of ATTEMPTS) if (v.every(t => now - t >= WINDOW_MS)) ATTEMPTS.delete(k)
  }
  return recent.length > MAX_ATTEMPTS
}

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

// Look up the email for a username (case-insensitive) via the service key.
async function emailForUsername(username) {
  try {
    const u = encodeURIComponent(username)
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/users?username=eq.${u}&select=email&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    )
    if (!r.ok) return null
    const rows = await r.json()
    return rows?.[0]?.email || null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
  if (!SERVICE_KEY) return send(res, 500, { error: 'Server not configured for username login' })

  if (tooManyAttempts(clientIp(req))) {
    return send(res, 429, { error: 'Too many attempts. Please wait a few minutes and try again.' })
  }

  let body
  try {
    body = await readBody(req)
  } catch {
    return send(res, 400, { error: 'Invalid request' })
  }
  const rawId = (body.username || '').trim()
  const password = body.password || ''
  if (!rawId || !password) return send(res, 400, { error: 'Enter your username and password' })

  // Resolve to an email. If an email was typed, use it directly (safety net so
  // no one can lock themselves out); otherwise resolve the username.
  const email = rawId.includes('@') ? rawId : await emailForUsername(rawId.toLowerCase())
  if (!email) return send(res, 401, { error: 'Invalid username or password' })

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.access_token) {
      return send(res, 401, { error: 'Invalid username or password' })
    }
    return send(res, 200, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
  } catch {
    return send(res, 500, { error: 'Login failed, please try again' })
  }
}
