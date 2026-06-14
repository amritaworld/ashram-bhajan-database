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
