import { malayalamToIAST } from './transliterate'

/**
 * Build a "loose phonetic skeleton" of a string for tolerant search.
 *
 * It makes the many ways a Malayalam/Sanskrit phrase can be written all collapse
 * to one key, so e.g. "ആരാരും കാണാതെ", "ararum kanate", "aararum kaanathe",
 * "ararum kanade" and "aararum kaanaadhe" all become "ararumkanate".
 *
 * Steps: Malayalam script → IAST; strip diacritics; lowercase; fold aspirated
 * digraphs and voicing/retroflex consonant classes to one base sound; squash
 * repeated letters (long vowels / doubled consonants); drop everything that
 * isn't a letter (incl. spaces) so word boundaries don't matter.
 */
export function looseSearchKey(text) {
  if (!text) return ''
  let s = text
  // Convert any Malayalam-script runs to IAST first.
  if (/[ഀ-ൿ]/.test(s)) s = malayalamToIAST(s)
  // Strip EVERY diacritic via Unicode decomposition — catches ā, ṃ, ṭ, ṇ, ñ,
  // ś, ṣ and the short-vowel breves (ĕ, ŏ) and under-marks (ḻ, ṟ, l̤) that
  // Sanscript emits for Malayalam, which a fixed map would miss.
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  s = s
    .replace(/[^a-z\s]/g, ' ')
    // aspirated digraphs → base
    .replace(/kh|gh/g, 'k')
    .replace(/chh|jh|ch/g, 'c')
    .replace(/th|dh/g, 't')
    .replace(/ph|bh/g, 'p')
    .replace(/sh/g, 's')
    // voicing / retroflex-dental folding → one base per place of articulation
    .replace(/[gq]/g, 'k')
    .replace(/j/g, 'c')
    .replace(/d/g, 't')
    .replace(/b/g, 'p')
    .replace(/w/g, 'v')
    // squash repeats (long vowels, geminate consonants)
    .replace(/(.)\1+/g, '$1')
    // boundary-agnostic
    .replace(/\s+/g, '')
  return s
}

// Split text into stanzas: each is a run of non-blank lines, with `gapAfter` =
// how many blank lines follow it before the next stanza. Leading/trailing
// blank lines don't create empty stanzas.
function toStanzas(text) {
  const lines = String(text ?? '').split('\n')
  const blocks = []
  let cur = null
  let pendingBlank = 0
  for (const line of lines) {
    if (line.trim() === '') {
      if (cur) pendingBlank++
    } else if (!cur) {
      cur = { lines: [line], gapAfter: 0 }
      blocks.push(cur)
    } else if (pendingBlank > 0) {
      cur.gapAfter = pendingBlank
      cur = { lines: [line], gapAfter: 0 }
      blocks.push(cur)
      pendingBlank = 0
    } else {
      cur.lines.push(line)
    }
  }
  return blocks
}

/**
 * Re-flow `target` so its blank-line spacing mirrors `source`, without ever
 * changing target's words. Used to keep the English (IAST) lyrics / English
 * meaning laid out with the same stanza spacing as the Malayalam being edited.
 *
 * Three tiers, most precise first, so it stays robust when the two languages
 * don't break lines identically (the common real-world case):
 *   1. Same number of non-blank lines → mirror blank lines line-by-line.
 *   2. Same number of stanzas → mirror the blank-line gaps *between* stanzas,
 *      keeping each target stanza's own line breaks intact.
 *   3. Otherwise → leave target unchanged (never scramble it).
 */
export function matchSpacing(source, target) {
  const srcLines = String(source ?? '').split('\n')
  const tgtContent = String(target ?? '').split('\n').filter((l) => l.trim() !== '')
  if (tgtContent.length === 0) return target ?? ''

  // Tier 1: equal non-blank line counts → precise line-by-line mirror.
  const srcContentCount = srcLines.filter((l) => l.trim() !== '').length
  if (srcContentCount === tgtContent.length) {
    let ti = 0
    const out = []
    for (const line of srcLines) out.push(line.trim() === '' ? '' : tgtContent[ti++])
    return out.join('\n')
  }

  // Tier 2: equal stanza counts → mirror the gaps between stanzas.
  const srcBlocks = toStanzas(source)
  const tgtBlocks = toStanzas(target)
  if (srcBlocks.length >= 2 && srcBlocks.length === tgtBlocks.length) {
    let out = ''
    for (let i = 0; i < tgtBlocks.length; i++) {
      out += tgtBlocks[i].lines.join('\n')
      if (i < tgtBlocks.length - 1) out += '\n'.repeat(srcBlocks[i].gapAfter + 1)
    }
    return out
  }

  // Tier 3: structures don't correspond → don't touch the target.
  return target ?? ''
}

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
