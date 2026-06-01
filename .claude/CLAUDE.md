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
- Upload multiple .docx files (folder picker or drag-and-drop)
- Each DOCX has 6 labelled sections: Title, Language, Malayalam Lyrics, Malayalam Meaning, English Lyrics, English Meaning
- Parses client-side, shows preview table (ok/warn/duplicate/error)
- Creates draft bhajans, dedupes, tags _REVIEW files
- Chunked import with per-row error handling

**Known issues & fixes:**
- Drag-and-drop: FileEntry.file() requires callback (fixed in last commit)
- Numeric fields: Convert empty strings to null (fixed in last commit)

---

## Feature #2: Tune Groups / Linked Translations (Next)
Requirements:
- Add "original version" selector field in Add/Edit Bhajan form
- A translation can point to its original bhajan (e.g., Malayalam original → Tamil translation)
- Display all linked language versions together as one "tune group"
- Admin (user) usually knows which is the original

---

## Pending Conversations / Ideas
(Add notes from other sessions here)

---

## Testing Checklist (Before Each Push)
- [ ] Feature works on localhost:5173
- [ ] No console errors (F12 → Console tab)
- [ ] No RLS blocking (check if data persists in Supabase dashboard)
- [ ] Empty/null fields handled correctly
