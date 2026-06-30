#!/usr/bin/env node

/**
 * One-time migration: rewrite every existing bhajan's `name` to IAST,
 * transliterated from the first line of its Malayalam lyrics — matching what
 * newly added/imported bhajans now get automatically.
 *
 * Safe by default: runs as a DRY RUN (prints what would change). Pass --apply
 * to actually write. Uses the service-role key to bypass RLS. Never touches
 * bhajan_id (slugs/audio folders depend on it) and skips bhajans with no
 * Malayalam lyrics (nothing to transliterate from).
 *
 * Usage:
 *   node scripts/migrate-iast-names.js           # dry run (preview)
 *   node scripts/migrate-iast-names.js --apply    # write changes
 */

import { createClient } from '@supabase/supabase-js'
import { toIASTTitle } from '../src/utils/transliterate.js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function malayalamOf(lyrics) {
  if (!lyrics) return ''
  try {
    const obj = typeof lyrics === 'string' ? JSON.parse(lyrics) : lyrics
    return obj.malayalam || ''
  } catch {
    return ''
  }
}

async function run() {
  const { data, error } = await supabase.from('bhajans').select('id, name, lyrics')
  if (error) {
    console.error('❌ Could not fetch bhajans:', error.message)
    process.exit(1)
  }

  const changes = []
  let noMalayalam = 0
  let alreadyIAST = 0

  for (const b of data) {
    const mal = malayalamOf(b.lyrics)
    if (!mal.trim()) { noMalayalam++; continue }
    const newName = toIASTTitle('', mal)
    if (!newName) { noMalayalam++; continue }
    if (newName === (b.name || '')) { alreadyIAST++; continue }
    changes.push({ id: b.id, from: b.name || '(blank)', to: newName })
  }

  console.log(`\nTotal bhajans:        ${data.length}`)
  console.log(`No Malayalam (skip):  ${noMalayalam}`)
  console.log(`Already IAST (skip):  ${alreadyIAST}`)
  console.log(`Would change:         ${changes.length}\n`)

  changes.slice(0, 25).forEach((c) => console.log(`  • "${c.from}"  →  "${c.to}"`))
  if (changes.length > 25) console.log(`  … and ${changes.length - 25} more`)

  if (!APPLY) {
    console.log('\n🔎 Dry run only. Re-run with --apply to write these changes.')
    return
  }

  console.log('\n✍️  Applying…')
  let ok = 0, failed = 0
  for (const c of changes) {
    const { error: upErr } = await supabase.from('bhajans').update({ name: c.to }).eq('id', c.id)
    if (upErr) { failed++; console.error(`  ✗ ${c.id}: ${upErr.message}`) }
    else ok++
  }
  console.log(`\n✅ Updated ${ok} bhajan name(s). ${failed ? `❌ ${failed} failed.` : ''}`)
}

run()
