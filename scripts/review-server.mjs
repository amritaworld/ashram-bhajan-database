#!/usr/bin/env node
/**
 * review-server.mjs — local helper server for the portal's local-only tools.
 *
 * Primary job today: the Audio Converter (/health, /convert) — standardizes any
 * audio the browser can't process (WMA/WAV/M4A/FLAC/…) to 128k stereo MP3 via
 * native ffmpeg. This part has no data-file dependencies.
 *
 * Also still contains the (now retired) Audio Review endpoints, which bridged
 * local files to the app: bhajan lyrics from the DOCX index, the audio match
 * index, layamritam reference metadata, on-demand 128k playback, and review
 * progress. These data files are optional now — if absent, the server still
 * starts and the converter works.
 *
 * Run:  node scripts/review-server.mjs   (or `npm run server`)  → http://localhost:5180
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { unzipSync, strFromU8 } from 'fflate'
import { parse as csvParse } from 'csv-parse/sync'

const PORT = 5180
const HOME = os.homedir()
const AUDIO_ROOT = '/Volumes/lalitha/Amma/Audio/Bhajans & Chants'
const FULL = path.join(HOME, 'bhajan-pipeline', 'output', 'full')
const WORK = path.join(HOME, 'bhajan-pipeline', 'audio-work')
const INDEX_CSV = path.join(WORK, 'audio_match_index.csv')
const LAYAM_CSV = path.join(HOME, 'Downloads', 'LayamritamSongs.csv')
const CACHE = path.join(WORK, 'audio-128-cache')
const PROGRESS = path.join(WORK, 'review_progress.json')
const FFMPEG = [
  '/Applications/net.downloadhelper.coapp.app/Contents/MacOS/ffmpeg',
  'ffmpeg',
].find(p => p === 'ffmpeg' || fs.existsSync(p)) || 'ffmpeg'

fs.mkdirSync(CACHE, { recursive: true })

// ---------- shared normalization (mirrors src/utils/iast.js) ----------
const IAST = { 'ā':'a','Ā':'a','ī':'i','Ī':'i','ū':'u','Ū':'u','ṛ':'r','Ṛ':'r','ṝ':'r','ḷ':'l','ḹ':'l','ñ':'n','Ñ':'n','ṇ':'n','Ṇ':'n','ṅ':'n','ṃ':'m','Ṃ':'m','ḥ':'h','Ḥ':'h','ś':'s','Ś':'s','ṣ':'s','Ṣ':'s','ṭ':'t','Ṭ':'t','ḍ':'d','Ḍ':'d','ē':'e','Ē':'e','ō':'o','Ō':'o' }
function normalizeIAST(t){ if(!t) return ''; let s=t; for(const[k,v]of Object.entries(IAST))s=s.split(k).join(v); return s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim() }
function lev(a,b){ const m=a.length,n=b.length; if(!m)return n; if(!n)return m; let prev=Array.from({length:n+1},(_,i)=>i); for(let i=1;i<=m;i++){let cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur} return prev[n] }
function fuzzyScore(a,b){ const s1=normalizeIAST(a),s2=normalizeIAST(b); if(!s1||!s2)return 0; if(s1===s2)return 100; if(s1.includes(s2)||s2.includes(s1))return 85; const d=lev(s1,s2); return Math.max(0,Math.round(100-d*15)) }
function slugify(name){ return (name||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,'-').substring(0,50) }

// ---------- DOCX → lyrics sections (Node port of src/utils/parseDocx.js) ----------
const SECTIONS = [
  { key:'title', match:s=>s==='Title' },
  { key:'language', match:s=>s==='Language' },
  { key:'lyrics_malayalam', match:s=>s==='Malayalam Lyrics' },
  { key:'meaning_malayalam', match:s=>s==='Malayalam Meaning' },
  { key:'lyrics_english', match:s=>s.startsWith('English Lyrics') },
  { key:'meaning_english', match:s=>s==='English Meaning' },
]
function decodeXml(s){ return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,d)=>String.fromCharCode(+d)).replace(/&amp;/g,'&') }
function paragraphsFromXml(xml){
  const paras = xml.split(/<w:p[ >]/).slice(1)
  return paras.map(block => {
    const seg = block.split('</w:p>')[0]
    let text = ''
    const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<w:cr\b[^>]*\/?>/g
    let m
    while ((m = re.exec(seg))) {
      if (m[1] !== undefined) text += decodeXml(m[1])
      else if (m[0].startsWith('<w:tab')) text += '\t'
      else text += '\n'
    }
    return text
  })
}
function splitSections(paragraphs){
  const result={}; let idx=-1; let buffer=[]
  const flush=()=>{ if(idx>=0) result[SECTIONS[idx].key]=buffer.join('\n').trim(); buffer=[] }
  for(const para of paragraphs){ const tr=para.trim(); const next=idx+1
    if(next<SECTIONS.length && tr && SECTIONS[next].match(tr)){ flush(); idx=next; continue }
    if(idx>=0) buffer.push(para) }
  flush(); return result
}
function parseDocxFile(absPath){
  const buf = new Uint8Array(fs.readFileSync(absPath))
  const zip = unzipSync(buf)
  const xmlBytes = zip['word/document.xml']
  if(!xmlBytes) throw new Error('no document.xml')
  const sec = splitSections(paragraphsFromXml(strFromU8(xmlBytes)))
  return {
    title: sec.title||'', language: sec.language||'',
    lyrics_malayalam: sec.lyrics_malayalam||'', meaning_malayalam: sec.meaning_malayalam||'',
    lyrics_english: sec.lyrics_english||'', meaning_english: sec.meaning_english||'',
  }
}

// ---------- load data once ----------
console.log('Loading data…')
console.log('  ffmpeg:', FFMPEG)

// title -> docx absolute path
const titleToDocx = new Map()
for (const d of [FULL, path.join(FULL,'_REVIEW')]) {
  if (!fs.existsSync(d)) continue
  for (const f of fs.readdirSync(d)) if (f.toLowerCase().endsWith('.docx')) titleToDocx.set(f.replace(/\.docx$/i,''), path.join(d,f))
}
// every title is reassignment-eligible (audio can be moved to any bhajan in the index)
const slugToTitle = new Map()
const allTitles = []
for (const title of titleToDocx.keys()) {
  const slug = slugify(title)
  slugToTitle.set(slug, title)
  allTitles.push({ slug, title, n: normalizeIAST(title) })
}

// layamritam reference
let layam = []
try {
  let raw = fs.readFileSync(LAYAM_CSV,'utf8'); if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1)
  layam = csvParse(raw, { columns:true, skip_empty_lines:true, relax_quotes:true, relax_column_count:true })
    .map(r=>({ title:r.Title||'', deity:r.Deity||'', raagam:r.Raagam||'', taalam:r.Taalam||'', year:r.RecordingYear||'', _n:normalizeIAST(r.Title||'') }))
  console.log(`  layamritam reference: ${layam.length} rows`)
} catch(e){ console.warn('  layamritam CSV not loaded:', e.message) }

function enrich(title){
  let best=null,bestScore=0
  for(const s of layam){ const sc=fuzzyScore(title, s.title); if(sc>bestScore){bestScore=sc;best=s} }
  if(!best || bestScore<70) return null
  return { theme:best.deity||'', raga:best.raagam||'', tala:best.taalam||'', year:best.year||'', confidence:bestScore,
           reason: bestScore===100?'Exact match':`Fuzzy match (${bestScore}%)`, matchedTitle:best.title }
}

// match index -> bhajans with audio. Optional: the Audio Review screen was
// removed, so the Audio Converter (/convert, /health) must still start even if
// this index is absent. A missing/unreadable index just means an empty queue.
const idToPath = new Map()
function audioId(rel){ return Buffer.from(rel).toString('base64url') }
const byTitle = new Map()
let indexRows = []
try {
  const indexRaw = fs.readFileSync(INDEX_CSV,'utf8')
  indexRows = csvParse(indexRaw, { columns:true, skip_empty_lines:true, relax_quotes:true })
  for(const r of indexRows){
    if(r.status!=='matched' && r.status!=='review') continue
    if(r.dup==='dup') continue
    const title=r.matched_title; if(!title) continue
    const rel=r.audio_path; const abs=path.join(AUDIO_ROOT, rel)
    idToPath.set(audioId(rel), abs)
    if(!byTitle.has(title)) byTitle.set(title,[])
    byTitle.get(title).push({ id:audioId(rel), name:path.basename(rel), rel, score:+r.score, band:r.status, ambiguous:r.ambiguous==='AMBIG' })
  }
} catch(e){ console.warn('  audio match index not loaded:', e.message) }

// build manifest (lightweight list); details computed lazily + cached
const items = []
for(const [title, audios] of byTitle){
  if(!titleToDocx.has(title)) continue // only bhajans we have lyrics for
  audios.sort((a,b)=>b.score-a.score)
  items.push({ slug:slugify(title), title, audioCount:audios.length,
    hasReviewBand: audios.some(a=>a.band==='review'), topScore:audios[0].score, _audios:audios })
}
items.sort((a,b)=> (b.topScore-a.topScore) || a.title.localeCompare(b.title))
console.log(`  review queue: ${items.length} bhajans with audio (${indexRows.filter(r=>r.status==='matched'||r.status==='review').length} audio rows)`)

const detailCache = new Map()
function detail(slug){
  if(detailCache.has(slug)) return detailCache.get(slug)
  const it = items.find(i=>i.slug===slug)
  const title = it ? it.title : slugToTitle.get(slug)
  if(!title || !titleToDocx.has(title)) return null
  let lyrics={malayalam:'',english:''}, meaning={malayalam:'',english:''}, language=''
  try{ const d=parseDocxFile(titleToDocx.get(title))
    language=d.language; lyrics={malayalam:d.lyrics_malayalam,english:d.lyrics_english}
    meaning={malayalam:d.meaning_malayalam,english:d.meaning_english} }catch(e){}
  const out={ slug, title, language,
    lyrics, meaning, enrichment:enrich(title),
    audios: it ? it._audios.map(a=>({ id:a.id, name:a.name, score:a.score, band:a.band, ambiguous:a.ambiguous, url:`/audio/${a.id}` })) : [] }
  detailCache.set(slug,out); return out
}

// ---------- progress ----------
function readProgress(){ try{ return JSON.parse(fs.readFileSync(PROGRESS,'utf8')) }catch(e){ return {} } }
function writeProgress(p){ fs.writeFileSync(PROGRESS, JSON.stringify(p,null,2)) }

// ---------- on-demand 128k conversion ----------
const converting = new Map()
function convert(id){
  const abs = idToPath.get(id); if(!abs) return Promise.reject(new Error('unknown id'))
  const out = path.join(CACHE, id+'.mp3')
  if(fs.existsSync(out) && fs.statSync(out).size>0) return Promise.resolve(out)
  if(converting.has(id)) return converting.get(id)
  const p = new Promise((resolve,reject)=>{
    const args=['-hide_banner','-loglevel','error','-y','-i',abs,'-vn','-map','0:a:0','-codec:a','libmp3lame','-b:a','128k','-ac','2',out]
    const ff=spawn(FFMPEG,args)
    let err=''
    ff.stderr.on('data',d=>err+=d)
    ff.on('close',code=>{ converting.delete(id); if(code===0&&fs.existsSync(out)) resolve(out); else { try{fs.unlinkSync(out)}catch(_){} reject(new Error('ffmpeg failed: '+err.slice(0,200))) } })
    ff.on('error',e=>{ converting.delete(id); reject(e) })
  })
  converting.set(id,p); return p
}
// ---------- ad-hoc conversion of an uploaded file (Audio Converter tool) ----------
// Standardizes any audio (WMA/WAV/M4A/FLAC/high-bitrate MP3, …) to the
// recommended 128k stereo MP3. Uses native ffmpeg, so it only works locally —
// the browser can't decode formats like WMA.
let convSeq = 0
function convertUpload(inputBuf, origName, bitrate){
  return new Promise((resolve, reject)=>{
    const ext = (path.extname(origName||'') || '.bin').toLowerCase()
    const stamp = `${Date.now()}-${++convSeq}`
    const inFile = path.join(os.tmpdir(), `bhajanconv-${stamp}${ext}`)
    const outFile = path.join(os.tmpdir(), `bhajanconv-${stamp}.mp3`)
    const cleanup = ()=>{ for(const f of [inFile,outFile]){ try{ fs.unlinkSync(f) }catch(_){} } }
    const br = /^(96|128|160|192|256)$/.test(String(bitrate)) ? String(bitrate) : '128'
    try{ fs.writeFileSync(inFile, inputBuf) }catch(e){ return reject(e) }
    const args = ['-hide_banner','-loglevel','error','-y','-i',inFile,'-vn','-map','0:a:0','-codec:a','libmp3lame','-b:a',br+'k','-ac','2',outFile]
    const ff = spawn(FFMPEG, args)
    let err=''
    ff.stderr.on('data',d=>err+=d)
    ff.on('close',code=>{
      if(code===0 && fs.existsSync(outFile)){
        let data; try{ data=fs.readFileSync(outFile) }catch(e){ cleanup(); return reject(e) }
        cleanup(); resolve(data)
      } else { cleanup(); reject(new Error('ffmpeg failed: '+err.slice(0,300))) }
    })
    ff.on('error',e=>{ cleanup(); reject(e) })
  })
}

function serveFileWithRange(req,res,file){
  const stat=fs.statSync(file); const range=req.headers.range
  const head={ 'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*' }
  if(range){ const m=/bytes=(\d*)-(\d*)/.exec(range); let start=+m[1]||0; let end=m[2]?+m[2]:stat.size-1
    if(start>=stat.size){ res.writeHead(416,head); return res.end() }
    res.writeHead(206,{...head,'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1})
    fs.createReadStream(file,{start,end}).pipe(res)
  } else { res.writeHead(200,{...head,'Content-Length':stat.size}); fs.createReadStream(file).pipe(res) }
}

// ---------- HTTP ----------
function json(res,obj,code=200){ res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}); res.end(JSON.stringify(obj)) }

http.createServer(async (req,res)=>{
  const u = new URL(req.url, `http://localhost:${PORT}`)
  if(req.method==='OPTIONS') return json(res,{})
  try{
    if(u.pathname==='/health'){
      return json(res, { ok:true, ffmpeg:FFMPEG })
    }
    if(u.pathname==='/convert' && req.method==='POST'){
      const chunks=[]
      req.on('data',d=>chunks.push(d))
      req.on('end', async ()=>{
        try{
          const buf=Buffer.concat(chunks)
          if(!buf.length) return json(res,{error:'empty body'},400)
          const name=decodeURIComponent(u.searchParams.get('name')||'audio')
          const bitrate=u.searchParams.get('bitrate')||'128'
          const mp3=await convertUpload(buf,name,bitrate)
          res.writeHead(200,{ 'Content-Type':'audio/mpeg','Content-Length':mp3.length,
            'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'X-Converted-Bytes',
            'X-Converted-Bytes':String(mp3.length) })
          res.end(mp3)
        }catch(e){ json(res,{error:String(e.message||e)},500) }
      })
      req.on('error',e=>json(res,{error:String(e.message||e)},500))
      return
    }
    if(u.pathname==='/manifest'){
      const prog=readProgress()
      return json(res, { count:items.length, ffmpeg:FFMPEG,
        items: items.map(i=>({ slug:i.slug, title:i.title, audioCount:i.audioCount, hasReviewBand:i.hasReviewBand, topScore:i.topScore, status:prog[i.slug]?.status||'pending' })) })
    }
    if(u.pathname==='/search'){
      const q=normalizeIAST(u.searchParams.get('q')||'')
      if(q.length<2) return json(res,{results:[]})
      const results=allTitles.filter(t=>t.n.includes(q)).slice(0,25).map(t=>({slug:t.slug,title:t.title}))
      return json(res,{results})
    }
    if(u.pathname.startsWith('/item/')){
      const d=detail(decodeURIComponent(u.pathname.slice(6))); return d?json(res,d):json(res,{error:'not found'},404)
    }
    if(u.pathname.startsWith('/audio/')){
      const id=u.pathname.slice(7)
      const file=await convert(id); return serveFileWithRange(req,res,file)
    }
    if(u.pathname==='/progress' && req.method==='POST'){
      let body=''; req.on('data',d=>body+=d); req.on('end',()=>{ const {slug,status,audios}=JSON.parse(body||'{}'); const p=readProgress(); p[slug]={status,audios:audios||[],at:new Date().toISOString()}; writeProgress(p); json(res,{ok:true}) }); return
    }
    if(u.pathname==='/progress'){ return json(res, readProgress()) }
    if(u.pathname==='/'){ res.writeHead(200,{'Content-Type':'text/plain'}); return res.end('review-server up. Open the portal → Audio Review.') }
    json(res,{error:'not found'},404)
  }catch(e){ json(res,{error:String(e.message||e)},500) }
}).listen(PORT, ()=> console.log(`\n✅ review-server on http://localhost:${PORT}\n   Open the portal and go to “Audio Review”.\n`))
