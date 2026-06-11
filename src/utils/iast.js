/**
 * Normalize IAST format Sanskrit text to simple English for matching
 * IAST uses diacritical marks: ā ī ū ñ ş ṇ ṭ ḍ ṛ etc.
 * Convert to ASCII equivalents: a i u n s n t d r etc.
 */
export function normalizeIAST(text) {
  if (!text) return ''

  // Map of IAST diacritical characters to ASCII equivalents
  const iastMap = {
    'ā': 'a', 'Ā': 'A',
    'ī': 'i', 'Ī': 'I',
    'ū': 'u', 'Ū': 'U',
    'ṛ': 'r', 'Ṛ': 'R',
    'ṝ': 'r', 'Ṝ': 'R',
    'ḷ': 'l', 'Ḷ': 'L',
    'ḹ': 'l', 'Ḹ': 'L',
    'ñ': 'n', 'Ñ': 'N',
    'ṇ': 'n', 'Ṇ': 'N',
    'ṅ': 'n', 'Ṅ': 'N',
    'ṃ': 'm', 'Ṃ': 'M',
    'ḥ': 'h', 'Ḥ': 'H',
    'ś': 's', 'Ś': 'S',
    'ṣ': 's', 'Ṣ': 'S',
    'ṭ': 't', 'Ṭ': 'T',
    'ḍ': 'd', 'Ḍ': 'D',
    'ṭ': 't', 'Ṭ': 'T',
  }

  let normalized = text
  for (const [iast, ascii] of Object.entries(iastMap)) {
    normalized = normalized.replace(new RegExp(iast, 'g'), ascii)
  }

  // Remove extra spaces and convert to lowercase for matching
  return normalized.toLowerCase().trim()
}

/**
 * Simple fuzzy match: check if two strings are similar enough
 * Returns a score from 0-100
 */
export function fuzzyScore(str1, str2) {
  const s1 = normalizeIAST(str1).toLowerCase()
  const s2 = normalizeIAST(str2).toLowerCase()

  if (s1 === s2) return 100 // Exact match
  if (s1.includes(s2) || s2.includes(s1)) return 85 // One contains the other

  // Levenshtein distance for partial matches
  const distance = levenshteinDistance(s1, s2)
  const maxLen = Math.max(s1.length, s2.length)
  const score = Math.max(0, 100 - (distance * 15))

  return Math.round(score)
}

/**
 * Normalize a stanza for comparison: strip IAST diacritics, lowercase,
 * drop punctuation, and collapse all whitespace (including line breaks)
 * to single spaces. Malayalam-script text passes through unchanged except
 * for punctuation/whitespace, so it still compares exactly.
 */
export function normalizeStanza(text) {
  if (!text) return ''
  return normalizeIAST(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop punctuation, keep letters/numbers
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The pallavi: everything in a lyrics block up to the first blank line.
 * Returns the first non-empty stanza, trimmed (line breaks preserved).
 */
export function firstStanza(lyrics) {
  if (!lyrics) return ''
  const blocks = String(lyrics).split(/\n[ \t]*\n/)
  for (const b of blocks) {
    if (b.trim()) return b.trim()
  }
  return ''
}

/**
 * Tier-1 fast-filter key: the normalized first line of a stanza.
 * Used to bucket candidates before the (more expensive) full-stanza compare.
 */
export function firstLineKey(stanza) {
  if (!stanza) return ''
  const line = String(stanza).split('\n').find((l) => l.trim()) || ''
  return normalizeStanza(line)
}

/**
 * Tier-2 similarity: normalized Levenshtein ratio (0-100) between two
 * full stanzas. Unlike fuzzyScore (tuned for short titles), this stays
 * meaningful for multi-line text.
 */
export function stanzaSimilarity(a, b) {
  const s1 = normalizeStanza(a)
  const s2 = normalizeStanza(b)
  if (!s1 || !s2) return 0
  if (s1 === s2) return 100
  const maxLen = Math.max(s1.length, s2.length)
  const d = levenshteinDistance(s1, s2)
  return Math.round((1 - d / maxLen) * 100)
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null)
  )

  for (let i = 0; i <= str1.length; i++) track[0][i] = i
  for (let j = 0; j <= str2.length; j++) track[j][0] = j

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      )
    }
  }

  return track[str2.length][str1.length]
}
