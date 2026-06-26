// Secure server-side endpoint: generate stanza-wise Malayalam + English
// meanings for a bhajan's lyrics using Gemini. The GEMINI_API_KEY stays on the
// server (Vercel env var) and is NEVER exposed to the browser.
//
// Runs both as a Vercel serverless function and under local Vite dev (via the
// dev middleware in vite.config.js). Uses only raw Node req/res so it works in
// both. Requires a valid Supabase auth token, so only logged-in users can call it.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xzjjelyvwwtwzirbuowj.supabase.co'
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IXJ2u6HkB261V4C4Sw05cQ_NwN7qTas'
const MODEL = 'gemini-2.5-flash-lite'

const PROMPT = `You are given the LYRICS of a devotional bhajan (in Malayalam script;
the language of the words is provided). Write the MEANING of these lyrics.

Return STRICT JSON with exactly these keys:
- "malayalam_meaning": the meaning in MALAYALAM, ONE PARAGRAPH PER STANZA
  (newline-separated), in the same order as the stanzas. A stanza is a block of
  lyric lines separated by a blank line.
- "english_meaning": the meaning in ENGLISH, ONE PARAGRAPH PER STANZA
  (newline-separated), parallel to malayalam_meaning and in the same order.
  Cover EVERY stanza from first to last — do not omit or truncate the final one.

Rules:
- Do NOT translate word-by-word; give a faithful meaning/summary per stanza.
- Do NOT rewrite or repeat the lyrics themselves — only their meaning.
- The number of paragraphs in each field must equal the number of stanzas.
- Output ONLY the JSON object, no markdown fences.

LANGUAGE OF LYRICS: {lang}
LYRICS:
---
{lyrics}
---`

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function send(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(obj))
}

// Lightweight in-memory per-user rate limiter so a single (possibly
// compromised) account can't run up the AI bill. Best-effort: state lives
// per warm serverless instance.
const CALLS = new Map() // userId -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000
const MAX_CALLS = 60
function tooManyCalls(userId) {
  const now = Date.now()
  const recent = (CALLS.get(userId) || []).filter(t => now - t < WINDOW_MS)
  recent.push(now)
  CALLS.set(userId, recent)
  if (CALLS.size > 5000) {
    for (const [k, v] of CALLS) if (v.every(t => now - t >= WINDOW_MS)) CALLS.delete(k)
  }
  return recent.length > MAX_CALLS
}

async function verifyUser(token) {
  if (!token) return null
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
    })
    if (!r.ok) return null
    return await r.json() // { email, ... }
  } catch {
    return null
  }
}

// flash-lite rates ($/1M tokens) and a rough USD->INR factor for display.
const IN_RATE = 0.1
const OUT_RATE = 0.4
const INR_PER_USD = 88
function costINR(promptTok, outTok) {
  return ((promptTok / 1e6) * IN_RATE + (outTok / 1e6) * OUT_RATE) * INR_PER_USD
}

// Best-effort usage log. Never blocks/breaks the main response.
async function logUsage(token, row) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/api_usage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    })
  } catch {
    /* ignore logging failures */
  }
}

// Gemini occasionally returns 503 (overloaded) / 429 / 500 under load. Retry
// these transient statuses with exponential backoff before giving up. Non-
// transient responses (and the final attempt) are returned as-is.
const RETRY_STATUS = new Set([429, 500, 503, 504])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function callGeminiWithRetry(apiKey, prompt, attempts = 4) {
  let last
  for (let i = 0; i < attempts; i++) {
    try {
      last = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        }
      )
      if (last.ok || !RETRY_STATUS.has(last.status)) return last
    } catch (e) {
      last = null // network error — retry too
    }
    if (i < attempts - 1) await sleep(600 * 2 ** i) // 600ms, 1.2s, 2.4s
  }
  // Exhausted retries: synthesize a 503-like response if the last attempt threw.
  return last || { ok: false, status: 503, text: async () => 'Gemini unreachable' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return send(res, 500, { error: 'GEMINI_API_KEY not configured on the server' })

  // Auth: only logged-in users may spend API credits.
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const user = await verifyUser(token)
  if (!user) return send(res, 401, { error: 'Not authenticated' })
  if (tooManyCalls(user.id || user.email || 'unknown')) {
    return send(res, 429, { error: 'Too many requests. Please wait a few minutes and try again.' })
  }

  let body
  try {
    body = await readBody(req)
  } catch {
    return send(res, 400, { error: 'Invalid JSON body' })
  }
  const lyrics = (body.lyrics || '').trim()
  const lang = (body.language || 'Malayalam').trim()
  if (!lyrics) return send(res, 400, { error: 'No lyrics provided' })

  const prompt = PROMPT.replace('{lang}', lang).replace('{lyrics}', lyrics)
  try {
    const gr = await callGeminiWithRetry(apiKey, prompt)
    if (!gr.ok) {
      const t = await gr.text()
      await logUsage(token, {
        user_email: user.email || null, feature: 'generate_meaning', model: MODEL,
        prompt_tokens: 0, output_tokens: 0, cost_inr: 0, status: 'error',
      })
      // 503/429/500 from Gemini mean it's overloaded — surface a friendly,
      // actionable message instead of a raw status code.
      const overloaded = [429, 500, 503, 504].includes(gr.status)
      const error = overloaded
        ? 'The AI service is busy right now. Please wait a moment and try again.'
        : `Gemini error ${gr.status}`
      return send(res, 502, { error, detail: t.slice(0, 300) })
    }
    const data = await gr.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
      parsed = JSON.parse(cleaned)
    }
    // Record usage + cost (best-effort).
    const u = data.usageMetadata || {}
    const promptTok = u.promptTokenCount || 0
    const outTok = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)
    await logUsage(token, {
      user_email: user.email || null, feature: 'generate_meaning', model: MODEL,
      prompt_tokens: promptTok, output_tokens: outTok,
      cost_inr: Number(costINR(promptTok, outTok).toFixed(4)), status: 'ok',
    })
    return send(res, 200, {
      malayalam_meaning: parsed.malayalam_meaning || '',
      english_meaning: parsed.english_meaning || '',
    })
  } catch (e) {
    return send(res, 500, { error: 'Failed to generate meaning', detail: String(e).slice(0, 200) })
  }
}
