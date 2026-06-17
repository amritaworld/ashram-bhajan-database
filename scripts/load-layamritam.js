#!/usr/bin/env node

/**
 * Load LayamritamSongs.csv into Supabase layamritam_songs table
 * Usage: node scripts/load-layamritam.js /path/to/LayamritamSongs.csv
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import { normalizeIAST } from '../src/utils/iast.js'
import dotenv from 'dotenv'

// Load .env file
dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('❌ Usage: node scripts/load-layamritam.js /path/to/LayamritamSongs.csv')
  process.exit(1)
}

if (!fs.existsSync(csvPath)) {
  console.error(`❌ File not found: ${csvPath}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function loadData() {
  try {
    console.log(`📖 Reading CSV: ${csvPath}`)
    let csvContent = fs.readFileSync(csvPath, 'utf-8')

    // Remove UTF-8 BOM if present
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1)
    }

    const records = parse(csvContent, { columns: true, trim: true })

    // Debug: show first record structure
    if (records.length > 0) {
      console.log('📋 First record keys:', Object.keys(records[0]))
      console.log('📋 First record sample:', records[0])
    }

    console.log(`✅ Parsed ${records.length} records`)

    // Transform records to match table schema
    const rows = records.map(record => ({
      title_iast: (record.Title || '').trim(),
      title_simple: normalizeIAST((record.Title || '').trim()),
      deity: normalizeIAST((record.Deity || '').trim()) || null,
      raagam: normalizeIAST((record.Raagam || '').trim()) || null,
      taalam: normalizeIAST((record.Taalam || '').trim()) || null,
      recording_year: record.RecordingYear ? parseInt(record.RecordingYear) : null,
      language: (record.Language || '').trim() || null,
      difficulty: (record.Difficulty || '').trim() || null,
      speed: (record.Speed || '').trim() || null,
      mood: (record.Mood || '').trim() || null,
    }))

    // Filter out rows with no title
    const validRows = rows.filter(r => r.title_iast)
    console.log(`✅ ${validRows.length} records have titles`)

    // Insert in chunks
    const CHUNK_SIZE = 100
    let inserted = 0
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE)
      const { error } = await supabase
        .from('layamritam_songs')
        .insert(chunk)

      if (error) {
        console.error(`❌ Error inserting chunk ${Math.floor(i / CHUNK_SIZE) + 1}:`, error.message)
        process.exit(1)
      }

      inserted += chunk.length
      console.log(`✅ Inserted ${inserted}/${validRows.length}`)
    }

    console.log(`\n🎉 Successfully loaded ${inserted} songs into layamritam_songs!`)
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

loadData()
