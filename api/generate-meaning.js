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

async function verifyUser(token) {
  if (!token) return false
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
    })
    return r.ok
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return send(res, 500, { error: 'GEMINI_API_KEY not configured on the server' })

  // Auth: only logged-in users may spend API credits.
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!(await verifyUser(token))) return send(res, 401, { error: 'Not authenticated' })

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
    const gr = await fetch(
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
    if (!gr.ok) {
      const t = await gr.text()
      return send(res, 502, { error: `Gemini error ${gr.status}`, detail: t.slice(0, 300) })
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
    return send(res, 200, {
      malayalam_meaning: parsed.malayalam_meaning || '',
      english_meaning: parsed.english_meaning || '',
    })
  } catch (e) {
    return send(res, 500, { error: 'Failed to generate meaning', detail: String(e).slice(0, 200) })
  }
}
