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

## Pending Conversations / Ideas
(Add notes from other sessions here)

---

## Testing Checklist (Before Each Push)
- [ ] Feature works on localhost:5173
- [ ] No console errors (F12 → Console tab)
- [ ] No RLS blocking (check if data persists in Supabase dashboard)
- [ ] Empty/null fields handled correctly
