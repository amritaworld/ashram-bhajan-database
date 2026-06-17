#!/usr/bin/env node
/**
 * audio-match.mjs — Match the SMB audio archive against the bhajan title index.
 *
 * Reads:
 *   ~/bhajan-pipeline/audio-work/audio_inventory.tsv   (size<TAB>path per line)
 *   ~/bhajan-pipeline/output/full/*.docx  + _REVIEW/*.docx   (titles = filenames)
 *
 * Writes:
 *   ~/bhajan-pipeline/audio-work/audio_match_index.csv  (reviewable mapping)
 *   prints summary + samples to stdout
 *
 * Matching is variant-tolerant: a "consonant skeleton" (vowels + aspirate-h
 * dropped, w→v, sh→s, doubles collapsed) folds Amrita/Amritha/Amrutha etc.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

const WORK = path.join(os.homedir(), 'bhajan-pipeline', 'audio-work')
const FULL = path.join(os.homedir(), 'bhajan-pipeline', 'output', 'full')
const INV = path.join(WORK, 'audio_inventory.tsv')
const OUT = path.join(WORK, 'audio_match_index.csv')

// ---------- normalization ----------
const IAST = { 'ā':'a','ī':'i','ū':'u','ṛ':'r','ṝ':'r','ḷ':'l','ḹ':'l','ñ':'n','ṇ':'n','ṅ':'n','ṃ':'m','ḥ':'h','ś':'s','ṣ':'s','ṭ':'t','ḍ':'d','ē':'e','ō':'o' }
function norm(s){
  s = (s||'').toLowerCase().normalize('NFC')
  s = s.replace(/[āīūṛṝḷḹñṇṅṃḥśṣṭḍēō]/g, c => IAST[c] || c)
  // strip remaining combining diacritics
  s = s.normalize('NFD').replace(/[̀-ͯ]/g,'').normalize('NFC')
  s = s.replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
  return s
}
// consonant skeleton of one word: fold transliteration variants, drop vowels & h
function skelWord(w){
  let s = w.toLowerCase()
  s = s.replace(/w/g,'v')
  s = s.replace(/ksh/g,'k').replace(/x/g,'k')
  s = s.replace(/chh/g,'c').replace(/sh/g,'s').replace(/ch/g,'c')
  s = s.replace(/th/g,'t').replace(/dh/g,'d').replace(/bh/g,'b')
  s = s.replace(/gh/g,'g').replace(/kh/g,'k').replace(/ph/g,'p').replace(/jh/g,'j')
  s = s.replace(/zh/g,'l')
  s = s.replace(/[aeiou]/g,'')   // drop vowels
  s = s.replace(/h/g,'')         // drop aspirate/standalone h
  s = s.replace(/(.)\1+/g,'$1')  // collapse doubles
  return s
}
function skeleton(normStr){
  return normStr.split(' ').filter(Boolean).map(skelWord).filter(Boolean).join('')
}
function tokenSkels(normStr){
  return normStr.split(' ').filter(Boolean).map(skelWord).filter(t=>t.length>0)
}

// ---------- audio filename cleaning ----------
const NOISE_WORDS = new Set(['bhajan','bhajans','malayalam','hindi','tamil','kannada','telugu','sanskrit','samskritam','gujarati','gujrati','marathi','bengali','oriya','punjabi','english','old','recordings','recording','edited','new','selected','instrumental','track','amma','swamiji','swami','sw','br','live','final','master','mix','version','ver','copy','audio','song','songs','chant','chants'])
function cleanAudioName(base){
  let s = base
  // cut at first metadata separator
  const cuts = [/_RAG[\s\-_]/i, /[\s\-]RAG[\s\-_]/i, /_RAAG/i, / - /, /[\s\-_]Sw[_\.\s]/i, /[\s\-]AMMA\b/i, / & /, /-OLD RECORDINGS/i, /\bRAG[\s\-][A-Z]/]
  let idx = s.length
  for (const c of cuts){ const m = s.match(c); if (m && m.index < idx) idx = m.index }
  s = s.slice(0, idx)
  s = s.replace(/\([^)]*\)/g,' ')             // remove parentheticals
  s = s.replace(/^[\s\d._\-]*\d[\s._\-]+/, '') // leading track numbers / dates
  let n = norm(s)
  // drop trailing/standalone noise words
  let toks = n.split(' ').filter(t => t && !NOISE_WORDS.has(t))
  return toks.join(' ')
}

// ---------- load titles ----------
function loadTitles(){
  const titles = []
  for (const d of [FULL, path.join(FULL,'_REVIEW')]){
    if (!fs.existsSync(d)) continue
    const review = d.endsWith('_REVIEW')
    for (const f of fs.readdirSync(d)){
      if (!f.toLowerCase().endsWith('.docx')) continue
      const raw = f.replace(/\.docx$/i,'')
      const n = norm(raw)
      titles.push({ raw, review, n, skel: skeleton(n), toks: tokenSkels(n) })
    }
  }
  return titles
}

// ---------- scoring ----------
function lev(a,b){
  const m=a.length,n=b.length; if(!m)return n; if(!n)return m
  let prev=new Array(n+1); for(let j=0;j<=n;j++)prev[j]=j
  for(let i=1;i<=m;i++){ let cur=[i]; const ai=a.charCodeAt(i-1)
    for(let j=1;j<=n;j++){ cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(ai===b.charCodeAt(j-1)?0:1)) }
    prev=cur }
  return prev[n]
}
function score(aSkel, aToks, t){
  if(!aSkel || !t.skel) return 0
  // skeleton levenshtein similarity
  const d = lev(aSkel, t.skel)
  const ml = Math.max(aSkel.length, t.skel.length)
  let simL = 1 - d/ml
  // prefix/containment: audio name is often a shorter slice of the full first-line title
  let pref = 0
  if (aSkel.length>=4){
    if (t.skel.startsWith(aSkel)) pref = 0.9 + 0.1*(aSkel.length/t.skel.length)
    else if (t.skel.includes(aSkel)) pref = 0.85
    else if (aSkel.startsWith(t.skel) && t.skel.length>=4) pref = 0.85
  }
  // token coverage of audio tokens within title tokens (variant-folded)
  let cov = 0
  if (aToks.length){
    let hit=0
    for (const at of aToks){ if (t.toks.some(tt => tt===at || (at.length>=3 && (tt.startsWith(at)||at.startsWith(tt))))) hit++ }
    cov = hit/aToks.length
    // require reasonable absolute coverage length so 1 common short token doesn't win
    if (aToks.length===1 && aToks[0].length<3) cov*=0.5
  }
  return Math.max(simL, pref, cov*0.85)
}

// ---------- main ----------
const titles = loadTitles()
// inverted index: token skeleton -> title indices
const inv = new Map()
titles.forEach((t,i)=>{ for(const tk of new Set(t.toks)){ if(!inv.has(tk))inv.set(tk,[]); inv.get(tk).push(i) } })
// shingle index: 3-grams of the full skeleton -> title indices (catches concatenated vs split spellings)
const shIdx = new Map()
function shingles(sk){ const out=[]; for(let i=0;i+3<=sk.length;i++) out.push(sk.slice(i,i+3)); return out }
titles.forEach((t,i)=>{ for(const g of new Set(shingles(t.skel))){ if(!shIdx.has(g))shIdx.set(g,[]); shIdx.get(g).push(i) } })

// folders to skip entirely (case-insensitive path substring match)
const EXCLUDE = [/Others\/Instrumental\//i, /Ashram Instrumental Music\//i]
let excluded = 0
const rows = fs.readFileSync(INV,'utf8').split('\n').filter(Boolean).map(l=>{
  const tab=l.indexOf('\t'); return { size:+l.slice(0,tab), path:l.slice(tab+1) }
}).filter(r=>{ if (EXCLUDE.some(re=>re.test(r.path))){ excluded++; return false } return true })

const DUP = new Map() // dedupe key -> first index seen
const results = []
for (const r of rows){
  const rel = r.path.split('/Bhajans & Chants/')[1] || r.path
  const base = path.basename(r.path).replace(/\.[^.]+$/,'')
  const clean = cleanAudioName(base)
  const aSkel = skeleton(clean)
  const aToks = tokenSkels(clean)
  // candidate titles via inverted index (shared token skeletons)
  const cand = new Set()
  for (const tk of aToks){ const ids=inv.get(tk); if(ids) for(const id of ids) cand.add(id) }
  // + shingle blocking: titles sharing >=2 skeleton 3-grams (catches concatenated vs split spellings)
  const shCount = new Map()
  for (const g of new Set(shingles(aSkel))){ const ids=shIdx.get(g); if(ids) for(const id of ids) shCount.set(id,(shCount.get(id)||0)+1) }
  for (const [id,c] of shCount){ if (c>=2) cand.add(id) }
  let best=null,bestS=-1,second=-1
  for (const id of cand){ const s=score(aSkel,aToks,titles[id]); if(s>bestS){second=bestS;bestS=s;best=titles[id]} else if(s>second) second=s }
  const status = bestS>=0.85 ? 'matched' : bestS>=0.62 ? 'review' : 'unmatched'
  const ambiguous = bestS>=0.62 && (bestS-second)<0.06
  // dedupe identical recordings: same skeleton-of-clean + same size bucket
  const dupKey = aSkel+'|'+r.size
  let dup = ''
  if (status!=='unmatched'){ if (DUP.has(dupKey)) dup='dup'; else DUP.set(dupKey, rel) }
  results.push({ rel, base, clean, size:r.size, matched: best? best.raw:'', score:Math.round(bestS*100), status, ambiguous: ambiguous?'AMBIG':'', dup })
}

// ---------- write CSV ----------
function csv(v){ const s=String(v??''); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s }
const header=['status','score','ambiguous','dup','matched_title','audio_clean','audio_path','size_bytes']
const lines=[header.join(',')]
for (const r of results.sort((a,b)=> (a.status.localeCompare(b.status)) || b.score-a.score)){
  lines.push([r.status,r.score,r.ambiguous,r.dup,csv(r.matched),csv(r.clean),csv(r.rel),r.size].join(','))
}
fs.writeFileSync(OUT, lines.join('\n'))

// ---------- summary ----------
const by = s => results.filter(r=>r.status===s)
const matched=by('matched'), review=by('review'), unmatched=by('unmatched')
const dups = results.filter(r=>r.dup==='dup').length
const matchedTitles = new Set(matched.filter(r=>!r.dup).map(r=>r.matched))
console.log(`\nTITLES: ${titles.length}   AUDIO FILES: ${results.length}   (excluded ${excluded} files in skipped folders)`)
console.log(`  matched   (>=85): ${matched.length}  (${matched.length-matched.filter(r=>r.dup).length} unique recordings, covering ${matchedTitles.size} distinct bhajans)`)
console.log(`  review  (65-84):  ${review.length}`)
console.log(`  unmatched (<65):  ${unmatched.length}`)
console.log(`  duplicate recordings flagged: ${dups}`)
console.log(`  ambiguous (close 2nd): ${results.filter(r=>r.ambiguous).length}`)
console.log(`\nCSV → ${OUT}`)
console.log(`\n--- sample MATCHED ---`)
for (const r of matched.filter(r=>!r.dup).slice(0,12)) console.log(`  [${r.score}] ${r.base.slice(0,42).padEnd(42)} -> ${r.matched}`)
console.log(`\n--- sample REVIEW ---`)
for (const r of review.slice(0,10)) console.log(`  [${r.score}] ${r.base.slice(0,42).padEnd(42)} -> ${r.matched}`)
console.log(`\n--- sample UNMATCHED ---`)
for (const r of unmatched.slice(0,10)) console.log(`  [${r.score}] ${r.base.slice(0,50)}`)
