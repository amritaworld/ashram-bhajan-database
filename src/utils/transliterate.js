import Sanscript from '@indic-transliteration/sanscript'

// Chillus (pure word-final consonants) aren't in Sanscript's Malayalam map,
// so they leak through untransliterated. Normalize each to its base
// consonant + virama (chandrakkala) before transliterating.
const VIRAMA = '്' // ്
const CHILLU = {
  'ൺ': 'ണ' + VIRAMA, // ൺ -> ണ്  (ṇ)
  'ൻ': 'ന' + VIRAMA, // ൻ -> ന്  (n)
  'ർ': 'ര' + VIRAMA, // ർ -> ര്  (r)
  'ൽ': 'ല' + VIRAMA, // ൽ -> ല്  (l)
  'ൾ': 'ള' + VIRAMA, // ൾ -> ള്  (ḷ)
  'ൿ': 'ക' + VIRAMA, // ൿ -> ക്  (k)
}

function normalizeChillus(line) {
  return line
    // Older "au" length mark (ൗ, U+0D57) isn't in Sanscript's map and leaks
    // through untransliterated — normalize it to the standard au matra (ൌ).
    .replace(/ൗ/g, 'ൌ')
    .replace(/[ൺ-ൿ]/g, (c) => CHILLU[c] || c)
}

/**
 * Transliterate Malayalam-script text to IAST (Roman with diacritics).
 * Mechanical/deterministic — no AI. Used to auto-fill the English (IAST)
 * lyrics field from the Malayalam lyrics. Blank lines / spacing preserved.
 */
export function malayalamToIAST(text) {
  if (!text || !text.trim()) return ''
  // Transliterate line-by-line so blank lines (stanza breaks) are preserved.
  return text
    .split('\n')
    .map((line) => (line.trim() ? Sanscript.t(normalizeChillus(line), 'malayalam', 'iast') : ''))
    .join('\n')
}

// True when the string contains any Malayalam-script character.
const hasMalayalam = (s) => /[ഀ-ൿ]/.test(s || '')

// Capitalise the first letter of each word, preserving IAST diacritics
// (ā, ṛ, ṣ … are single code points, so toUpperCase works on them directly).
const titleCaseIAST = (s) => s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1))

/**
 * Produce a proper IAST (diacritic) title for a bhajan.
 *  - Title written in Malayalam script  → transliterate the title itself.
 *  - Title already romanised            → transliterate the first line of the
 *    Malayalam lyrics, so the stored title still carries proper IAST.
 *  - No Malayalam available             → return the title unchanged.
 * The result is title-cased (Ādiba O Raṅga) to match the existing title style.
 */
export function toIASTTitle(title, malayalamLyrics = '') {
  const t = (title || '').trim()
  if (hasMalayalam(t)) {
    return titleCaseIAST(malayalamToIAST(t).trim()) || t
  }
  const firstLine = String(malayalamLyrics || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  if (firstLine && hasMalayalam(firstLine)) {
    return titleCaseIAST(malayalamToIAST(firstLine).trim()) || t
  }
  return t
}
