# Ashram Bhajan Database — Project Instructions

## User Role & Permissions
- **Admin user** — full access to all features
- Treat as beginner — handle git commits/pushes

---

## Critical Workflow: DO NOT AUTO-DEPLOY

⚠️ **IMPORTANT: Test locally BEFORE pushing to GitHub**

1. Make code changes
2. **User tests on `localhost:5173`** 
3. **User approves in chat** ("looks good", "working", etc.)
4. **Then and only then:** I push to GitHub
5. Vercel auto-deploys after push

**Never push without explicit local testing approval.**

---

## Project Setup
- React 19 + Vite + Supabase + Vercel
- Dev server: `npm run dev` → `localhost:5173`
- Workflow: edit code → test locally → commit → push → auto-deploy to Vercel
- Supabase: Uses RLS policies (watch out — they've silently blocked inserts before)

---

## Key RLS & Security Notes
- **bhajans table RLS**: Contributors can only create/edit their own bhajans (or admins can edit any)
- **All inserted fields require proper nullability**: Empty strings on numeric fields cause "invalid input syntax for type numeric" errors
- Test imports thoroughly — RLS can silently fail inserts without clear errors

---

## Current Features (Completed)

### Feature #1: Bulk Bhajan Import ✅
- Page: `/import`
- Upload multiple .docx files (folder picker, file multi-select, or drag-and-drop)
- Each DOCX has 6 labelled sections: Title, Language, Malayalam Lyrics, Malayalam Meaning, English Lyrics, English Meaning
- Parses client-side, shows preview table (ok/warn/duplicate/error)
- File modification dates visible in preview
- Auto-skip duplicates checkbox (checked by default)
- Creates draft bhajans, dedupes, tags _REVIEW files
- Chunked import (50 at a time) with per-row error handling

**Features:**
- ✅ Drag-and-drop support (folder or individual files)
- ✅ Duplicate detection (DB + batch)
- ✅ File date display (helps identify old vs new uploads)
- ✅ Numeric field validation (empty → null, not empty string)

---

### Feature #2: Tune Groups / Linked Translations ✅
- Add "original version" searchable selector in Add/Edit Bhajan form
- Uses `BhajanSearch` component (fetches results as user types)
- A translation can link to its original bhajan (e.g., Malayalam original → Tamil translation)
- Display all linked language versions in bhajan details modal as one "tune group"
- Shows: 🔵 Original | 🔗 Translations | (current) badge

**Features:**
- ✅ Searchable original selection (BhajanSearch component)
- ✅ Load/save original_bhajan_id correctly
- ✅ Tune group display in details modal
- ✅ Malayalam lyrics search on Dashboard (first line matching)
- ✅ Search by bhajan name OR opening words of Malayalam lyrics

---

### Feature #3: Auto-Enrichment from LayamritamSongs ⏳ (In Progress)
- One-time data load from LayamritamSongs.xlsx (3,163 reference songs)
- Auto-populate theme, raga, tala, year when matching bhajans by name
- Handles IAST format (Sanskrit diacriticals: ā, ī, ū, ñ, ṣ, etc.)
- Fuzzy matching allows slight spelling differences (e.g., "Aadi Ba O Ranga" ≈ "Adiba O Ranga")
- Works during bulk import AND single bhajan creation

**Completed:**
- ✅ Created IAST normalization utility (`src/utils/iast.js`)
- ✅ Supabase table `layamritam_songs` created with 3,163 reference songs
- ✅ Auto-enrichment logic integrated into BulkImport and BhajanForm
- ✅ CSV properly encoded with UTF-8 (fixed BOM issue)
- ✅ Removed `/enrich` menu and route (one-time load, not persistent UI)
- ✅ Load script created: `scripts/load-layamritam.js`

**Pending / Issues:**
- ⚠️ Value mapping mismatch: CSV values need to map to actual DB values
  - Theme: CSV "Kṛṣṇa" (normalized → "krishna") must match actual DB theme (e.g., "krsna (legacy)")
  - Tala: CSV "Dādra-6/12" must match exact format in DB (spacing/punctuation)
- ⚠️ Year field: Not populating in BhajanForm (form default value blocking enrichment)
- 🔧 Need to test on real data and verify matching works

**Files Created/Modified:**
- ✅ NEW: `src/utils/iast.js` — IAST character normalization
- ✅ MODIFIED: `src/utils/excelEnrich.js` — Supabase table queries (not file-based)
- ✅ MODIFIED: `src/pages/BulkImport.jsx` — Auto-enrich each DOCX during import
- ✅ MODIFIED: `src/pages/BhajanForm.jsx` — Auto-enrich when saving single bhajans
- ✅ MODIFIED: `src/App.jsx` — Removed /enrich route
- ✅ MODIFIED: `src/components/Header.jsx` — Removed Enrich menu link
- ✅ NEW: `supabase/migrations/create_layamritam_songs_table.sql` — Table schema
- ✅ NEW: `scripts/load-layamritam.js` — Data loading utility
- ✅ NEW: `.env` — Supabase credentials (do not commit)

**Next Session Resume:**
1. Check themes table for exact theme names in DB (run `/themes` or `SELECT * FROM themes`)
2. Check how talas are stored (example values from DB)
3. Update enrichment logic to map CSV → DB values (add lookup/mapping)
4. Fix year_of_recording default value issue in BhajanForm
5. Test import and single bhajan creation
6. Commit and push to GitHub

---

## Pending Conversations / Ideas
(Add notes from other sessions here)

---

## Testing Checklist (Before Each Push)
- [ ] Feature works on localhost:5173
- [ ] No console errors (F12 → Console tab)
- [ ] No RLS blocking (check if data persists in Supabase dashboard)
- [ ] Empty/null fields handled correctly
