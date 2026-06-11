import { supabase } from '../config/supabase'
import { normalizeIAST, fuzzyScore } from './iast'

/**
 * Find enrichment data from layamritam_songs table by bhajan title
 * Handles IAST format titles in the source data
 * Returns { theme, raga, tala, year, confidence, reason } or null if no match
 */
export async function findEnrichmentData(bhajanTitle) {
  if (!bhajanTitle) return null

  try {
    // Fetch all songs from layamritam reference table
    const { data: songs, error } = await supabase
      .from('layamritam_songs')
      .select('title_iast, deity, raagam, taalam, recording_year')

    if (error || !songs || songs.length === 0) return null

    // Find best match using fuzzy scoring
    let bestMatch = null
    let bestScore = 0

    for (const song of songs) {
      const score = fuzzyScore(bhajanTitle, song.title_iast || '')
      if (score > bestScore) {
        bestScore = score
        bestMatch = song
      }
    }

    // Only return if confidence >= 70%
    if (!bestMatch || bestScore < 70) return null

    return {
      theme: bestMatch.deity,
      raga: bestMatch.raagam,
      tala: bestMatch.taalam,
      year: bestMatch.recording_year,
      confidence: bestScore,
      reason: bestScore === 100 ? 'Exact match' : `Fuzzy match (${bestScore}%)`
    }
  } catch (err) {
    console.error('Error finding enrichment data:', err)
    return null
  }
}

/**
 * Enrich a single bhajan object with data from layamritam table
 * Only fills in empty fields
 */
export async function enrichBhajan(bhajan) {
  const enrichment = await findEnrichmentData(bhajan.name)
  if (!enrichment) return bhajan

  const enriched = { ...bhajan }
  const updated = []

  // Only fill empty fields
  if (enrichment.theme && !enriched.theme) {
    enriched.theme = enrichment.theme
    updated.push('theme')
  }
  if (enrichment.raga && !enriched.raga) {
    enriched.raga = enrichment.raga
    updated.push('raga')
  }
  if (enrichment.tala && !enriched.tala) {
    enriched.tala = enrichment.tala
    updated.push('tala')
  }
  if (enrichment.year && !enriched.year) {
    enriched.year = enrichment.year
    updated.push('year')
  }

  enriched._enrichmentUsed = updated.length > 0
  enriched._enrichmentFields = updated
  enriched._enrichmentConfidence = enrichment.confidence

  return enriched
}
