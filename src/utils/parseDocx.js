import { unzipSync, strFromU8 } from 'fflate'

// The six labelled sections every converted bhajan DOCX contains, in order.
// We match them as a strict sequence so a stray word in the content (e.g. lyrics
// that happen to contain "Language") can never be mistaken for a section header.
const SECTIONS = [
  { key: 'title', match: (s) => s === 'Title' },
  { key: 'language', match: (s) => s === 'Language' },
  { key: 'lyrics_malayalam', match: (s) => s === 'Malayalam Lyrics' },
  { key: 'meaning_malayalam', match: (s) => s === 'Malayalam Meaning' },
  // The English lyrics label is sometimes "English Lyrics (IAST)".
  { key: 'lyrics_english', match: (s) => s.startsWith('English Lyrics') },
  { key: 'meaning_english', match: (s) => s === 'English Meaning' },
]

// Pull plain text out of a Word document's XML, one string per <w:p> paragraph.
function paragraphsFromDocumentXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Could not read the Word document (invalid XML)')
  }
  const paras = Array.from(doc.getElementsByTagName('w:p'))
  return paras.map((p) => {
    // A paragraph's visible text is the concatenation of its <w:t> runs.
    // <w:tab/> and <w:br/> become whitespace so words don't run together.
    let text = ''
    for (const node of Array.from(p.getElementsByTagName('*'))) {
      const tag = node.tagName
      if (tag === 'w:t') text += node.textContent
      else if (tag === 'w:tab') text += '\t'
      else if (tag === 'w:br' || tag === 'w:cr') text += '\n'
    }
    return text
  })
}

// Split the ordered paragraphs into the six sections by walking forward and
// advancing to the next expected label whenever we see it.
function splitSections(paragraphs) {
  const result = {}
  let idx = -1 // index into SECTIONS of the section we're currently inside
  let buffer = []
  const flush = () => {
    if (idx >= 0) result[SECTIONS[idx].key] = buffer.join('\n').trim()
    buffer = []
  }
  for (const para of paragraphs) {
    const trimmed = para.trim()
    const next = idx + 1
    if (next < SECTIONS.length && trimmed && SECTIONS[next].match(trimmed)) {
      flush()
      idx = next
      continue
    }
    if (idx >= 0) buffer.push(para)
  }
  flush()
  return result
}

/**
 * Parse a single .docx File into its bhajan sections.
 * Returns { title, language, lyrics_malayalam, meaning_malayalam,
 *           lyrics_english, meaning_english } with trimmed strings.
 * Missing sections come back as ''.
 */
export async function parseDocx(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  const zip = unzipSync(buf)
  const xmlBytes = zip['word/document.xml']
  if (!xmlBytes) throw new Error('Not a valid .docx (no word/document.xml)')
  const xml = strFromU8(xmlBytes)
  const sections = splitSections(paragraphsFromDocumentXml(xml))
  return {
    title: sections.title || '',
    language: sections.language || '',
    lyrics_malayalam: sections.lyrics_malayalam || '',
    meaning_malayalam: sections.meaning_malayalam || '',
    lyrics_english: sections.lyrics_english || '',
    meaning_english: sections.meaning_english || '',
  }
}

// Slug used for the bhajans.bhajan_id column, mirroring BhajanForm's generator.
export function generateBhajanId(name) {
  return name
    // Fold IAST diacritics to ASCII (ā→a, ṛ→r, ṣ→s …) so titles carrying
    // diacritics still yield a clean a–z slug instead of dropping letters.
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50)
}
