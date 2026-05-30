import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://xzjjelyvwwtwzirbuowj.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_IXJ2u6HkB261V4C4Sw05cQ_NwN7qTas'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export const signOut = async () => {
  await supabase.auth.signOut()
}
