import { supabase } from '../config/supabase'

/**
 * Fetch all bhajans linked to the same original (tune group)
 * @param {string} bhajanId - The ID of the bhajan (original or translation)
 * @returns {Promise<Array>} Array of all bhajans in the tune group
 */
export async function fetchTuneGroup(bhajanId) {
  // First, find if this bhajan is a translation (has an original)
  const { data: bhajan, error: bhajanError } = await supabase
    .from('bhajans')
    .select('id, name, language, original_bhajan_id')
    .eq('id', bhajanId)
    .single()

  if (bhajanError || !bhajan) return []

  // Determine the "root" original ID
  const originalId = bhajan.original_bhajan_id || bhajanId

  // Fetch all bhajans linked to this original
  const { data: tuneGroup, error: groupError } = await supabase
    .from('bhajans')
    .select('id, name, language, original_bhajan_id, status')
    .or(`id.eq.${originalId},original_bhajan_id.eq.${originalId}`)
    .order('language')

  if (groupError) return []

  // Sort so original comes first
  return (tuneGroup || []).sort((a, b) => {
    if (a.id === originalId) return -1
    if (b.id === originalId) return 1
    return 0
  })
}

/**
 * Check if a bhajan is part of a tune group
 * @param {string} bhajanId - The ID of the bhajan
 * @returns {Promise<boolean>} True if it has an original or translations linked to it
 */
export async function isPartOfTuneGroup(bhajanId) {
  const { data, error } = await supabase
    .from('bhajans')
    .select('id')
    .or(`id.eq.${bhajanId},original_bhajan_id.eq.${bhajanId}`)
    .limit(2) // Just need to know if there's more than 1

  if (error) return false
  return (data || []).length > 1
}
