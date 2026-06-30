import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../config/supabase'
import AudioPlayer from '../components/AudioPlayer'
import TagInput from '../components/TagInput'
import NOCGenerator from '../components/NOCGenerator'
import ContributorMultiSelect from '../components/ContributorMultiSelect'
import AutoTextarea from '../components/AutoTextarea'
import ComboBox from '../components/ComboBox'
import BhajanSearch from '../components/BhajanSearch'
import { showAlert, showConfirm, showToast } from '../components/Dialog'
import { malayalamToIAST, toIASTTitle } from '../utils/transliterate'
import { matchSpacing } from '../utils/iast'

const COMMON_LANGUAGES = ['Malayalam', 'Sanskrit', 'Tamil', 'Hindi', 'Telugu', 'Kannada', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Odia', 'English']

// Escape a user string so it can be used literally inside a RegExp.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Serialise every saved field into a stable string. Used to detect whether the
// form has changed since the last save, so autosave only writes on real edits.
const makeSnapshot = (v) => JSON.stringify({
  name: v.name, theme: v.theme, language: v.language, originalBhajanId: v.originalBhajanId,
  ragasCarnatic: v.ragasCarnatic, ragasHindustani: v.ragasHindustani,
  talasCarnatic: v.talasCarnatic, talasHindustani: v.talasHindustani,
  ragaRemarks: v.ragaRemarks, talaRemarks: v.talaRemarks, notes: v.notes,
  duration_minutes: v.duration_minutes, year_of_recording: v.year_of_recording,
  lyrics_malayalam: v.lyrics_malayalam, lyrics_english: v.lyrics_english,
  meaning_malayalam: v.meaning_malayalam, meaning_english: v.meaning_english,
  status: v.status, copyrightHolder: v.copyrightHolder,
  copyrightStatus: v.copyrightStatus, licenseType: v.licenseType,
  lyricists: v.lyricists, composers: v.composers, singers: v.singers,
})

function BhajanForm({ userRole }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  // Ordered list of bhajan ids for the prev/next arrows. Passed from the
  // Dashboard (so it matches the filtered/sorted list the user was viewing);
  // falls back to all bhajans in the same alphabetical order on direct visits.
  const [navOrder, setNavOrder] = useState(location.state?.order || null)
  const [name, setName] = useState('')
  // When true, the Name was hand-edited (or loaded from an existing bhajan), so
  // we stop auto-generating it from the Malayalam lyrics as they're typed.
  const [nameManual, setNameManual] = useState(false)
  const [theme, setTheme] = useState('')
  const [language, setLanguage] = useState('')
  const [originalBhajanId, setOriginalBhajanId] = useState('')
  const [ragasCarnatic, setRagasCarnatic] = useState([])
  const [ragasHindustani, setRagasHindustani] = useState([])
  const [talasCarnatic, setTalasCarnatic] = useState([])
  const [talasHindustani, setTalasHindustani] = useState([])
  const [ragaRemarks, setRagaRemarks] = useState('')
  const [talaRemarks, setTalaRemarks] = useState('')
  const [notes, setNotes] = useState('')
  const [duration_minutes, setDuration] = useState('')
  const [year_of_recording, setYearOfRecording] = useState('')
  const [lyrics_malayalam, setLyricsMalayalam] = useState('')
  const [lyrics_english, setLyricsEnglish] = useState('')
  // When true, the English (IAST) field was hand-edited/loaded, so we don't
  // auto-overwrite it as Malayalam changes. The "Sync" button resets this.
  const [englishManual, setEnglishManual] = useState(false)
  // Find & replace within the Malayalam lyrics
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [meaning_malayalam, setMeaningMalayalam] = useState('')
  const [meaning_english, setMeaningEnglish] = useState('')
  const [generatingMeaning, setGeneratingMeaning] = useState(false)
  const [status, setStatus] = useState('draft')
  const [copyrightHolder, setCopyrightHolder] = useState('Mata Amritanandamayi Math')
  const [copyrightStatus, setCopyrightStatus] = useState('pending')
  const [licenseType, setLicenseType] = useState('proprietary')
  const [showNOC, setShowNOC] = useState(false)
  const [lyricists, setLyricists] = useState([])
  const [composers, setComposers] = useState([])
  const [singers, setSingers] = useState([])
  const [audioFiles, setAudioFiles] = useState([])
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [loading, setLoading] = useState(false)
  // Autosave status for existing bhajans: idle | pending | saving | saved | error
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle')
  // Snapshot of the last-persisted form state, so autosave only fires on changes.
  // Stays null until an existing bhajan finishes loading (guards against the
  // empty initial form overwriting the record).
  const lastSavedRef = useRef(null)
  // Ensures at most one "updated" activity-log entry per editing session.
  const loggedThisSessionRef = useRef(false)
  const [user, setUser] = useState(null)
  const [bhajanId, setBhajanId] = useState('')
  const [themes, setThemes] = useState([])
  const [contributors, setContributors] = useState([])
  const [suggestions, setSuggestions] = useState({
    themes: [],
    ragasCarnatic: [],
    ragasHindustani: [],
    talasCarnatic: [],
    talasHindustani: [],
    languages: [],
    lyricists: [],
    composers: [],
    singers: []
  })

  useEffect(() => {
    getUser()
    loadThemes()
    loadContributors()
    loadSuggestions()
    if (id) loadBhajan()
  }, [id])

  // Build the prev/next order on direct visits (no list handed over from the
  // Dashboard) — every bhajan, alphabetical by name, matching the Dashboard default.
  useEffect(() => {
    if (navOrder || !id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('bhajans').select('id, name')
      if (cancelled || !data) return
      const sorted = [...data].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      )
      setNavOrder(sorted.map((b) => b.id))
    })()
    return () => { cancelled = true }
  }, [id, navOrder])

  // Adjacent bhajans for the floating prev/next arrows.
  const navIndex = navOrder ? navOrder.indexOf(id) : -1
  const prevId = navIndex > 0 ? navOrder[navIndex - 1] : null
  const nextId = navIndex >= 0 && navIndex < navOrder.length - 1 ? navOrder[navIndex + 1] : null
  const goToBhajan = async (targetId) => {
    if (!targetId) return
    // Flush any pending edits first — moving on unmounts the form and would
    // otherwise drop the debounced autosave.
    if (id && lastSavedRef.current !== null && snapshot() !== lastSavedRef.current) {
      await saveBhajan({ silent: true })
    }
    navigate(`/bhajan/${targetId}/edit`, { state: { order: navOrder } })
  }

  const loadContributors = async () => {
    try {
      const { data, error } = await supabase
        .from('contributors')
        .select('id, name, email')
        .order('name')
      if (error) throw error
      setContributors(data || [])
    } catch (err) {
      console.error('Error loading contributors:', err)
    }
  }


  const loadThemes = async () => {
    try {
      const { data, error } = await supabase
        .from('themes')
        .select('id, name')
        .order('name')
      if (error) throw error
      setThemes(data || [])
    } catch (err) {
      console.error('Error loading themes:', err)
    }
  }

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const loadSuggestions = async () => {
    try {
      const { data: bhajanData } = await supabase
        .from('bhajans')
        .select('theme, raga, tala, raga_carnatic, raga_hindustani, tala_carnatic, tala_hindustani')

      const { data: writerData } = await supabase
        .from('bhajan_writers')
        .select('writer_name, writer_role')

      const { data: singerData } = await supabase
        .from('bhajan_singers')
        .select('singer_name')

      // Build raga/tala suggestion pools from every system (Carnatic, Hindustani,
      // and the legacy single field) so autocomplete covers all entries.
      const splitAll = (rows, cols) =>
        [...new Set(rows.flatMap(b => cols.flatMap(c => (b[c] || '').split(',').map(s => s.trim()))).filter(Boolean))].sort()

      // Separate suggestion pools per system — Carnatic and Hindustani raga/tala
      // names differ, so each box only suggests from its own column. The legacy
      // single field is folded into the matching system (raga→Carnatic, tala→Hindustani).
      const themes = [...new Set(bhajanData?.map(b => b.theme).filter(Boolean))].sort()
      const ragasCarnatic = splitAll(bhajanData || [], ['raga_carnatic', 'raga'])
      const ragasHindustani = splitAll(bhajanData || [], ['raga_hindustani'])
      const talasCarnatic = splitAll(bhajanData || [], ['tala_carnatic'])
      const talasHindustani = splitAll(bhajanData || [], ['tala_hindustani', 'tala'])
      const languages = [...COMMON_LANGUAGES].sort()

      const lyricists = [...new Set(writerData?.filter(w => w.writer_role === 'lyricist').map(w => w.writer_name).filter(Boolean))].sort()
      const composers = [...new Set(writerData?.filter(w => w.writer_role === 'composer').map(w => w.writer_name).filter(Boolean))].sort()
      const singers = [...new Set(singerData?.map(s => s.singer_name).filter(Boolean))].sort()

      setSuggestions({
        themes,
        ragasCarnatic,
        ragasHindustani,
        talasCarnatic,
        talasHindustani,
        languages,
        lyricists,
        composers,
        singers
      })
    } catch (err) {
      console.log('Error loading suggestions:', err)
    }
  }

  const generateBhajanId = (bhajanName) => {
    return bhajanName
      // Fold IAST diacritics to ASCII (ā→a, ṛ→r, ṣ→s …) so titles carrying
      // diacritics still yield a clean a–z slug instead of dropping letters.
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50)
  }

  // Resolve a slug that isn't already taken. bhajan_id has a UNIQUE constraint,
  // so two bhajans with the same name would otherwise collide on insert. Append
  // -2, -3, … until free — the same scheme the bulk importer uses.
  const getUniqueBhajanId = async (base) => {
    const safeBase = base || 'bhajan'
    const { data, error } = await supabase
      .from('bhajans')
      .select('bhajan_id')
      .like('bhajan_id', `${safeBase}%`)
    if (error) throw error
    const taken = new Set((data || []).map((r) => r.bhajan_id))
    if (!taken.has(safeBase)) return safeBase
    let n = 2
    while (taken.has(`${safeBase}-${n}`)) n++
    return `${safeBase}-${n}`
  }

  // Snapshot of the current form state (for autosave change-detection).
  const snapshot = () => makeSnapshot({
    name, theme, language, originalBhajanId,
    ragasCarnatic, ragasHindustani, talasCarnatic, talasHindustani,
    ragaRemarks, talaRemarks, notes, duration_minutes, year_of_recording,
    lyrics_malayalam, lyrics_english, meaning_malayalam, meaning_english,
    status, copyrightHolder, copyrightStatus, licenseType,
    lyricists, composers, singers,
  })

  // Autosave — existing bhajans only. Debounced 1.5s after the last change.
  // The null-baseline guard plus the debounce mean the initial load never
  // triggers a write; only genuine edits do.
  useEffect(() => {
    if (!id || loading || lastSavedRef.current === null) return
    if (snapshot() === lastSavedRef.current) return
    setAutoSaveStatus('pending')
    const t = setTimeout(() => { saveBhajan({ silent: true }) }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name, theme, language, originalBhajanId,
    ragasCarnatic, ragasHindustani, talasCarnatic, talasHindustani,
    ragaRemarks, talaRemarks, notes, duration_minutes, year_of_recording,
    lyrics_malayalam, lyrics_english, meaning_malayalam, meaning_english,
    status, copyrightHolder, copyrightStatus, licenseType,
    lyricists, composers, singers, id, loading,
  ])

  const loadBhajan = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('bhajans')
      .select('*')
      .eq('id', id)
      .single()

    if (data) {
      setBhajanId(data.bhajan_id)
      setName(data.name || '')
      // Existing record already has a title — never auto-overwrite it.
      setNameManual(true)
      setTheme(data.theme || '')
      setLanguage(data.language || '')
      setOriginalBhajanId(data.original_bhajan_id || '')
      // Split comma lists into tags. Fallback for un-migrated rows: existing
      // single-field raga is Carnatic, single-field tala is Hindustani.
      const toTags = (s) => (s ? s.split(',').map(t => t.trim()).filter(Boolean) : [])
      const rc = toTags(data.raga_carnatic || data.raga)
      const rh = toTags(data.raga_hindustani)
      const tc = toTags(data.tala_carnatic)
      const th = toTags(data.tala_hindustani || data.tala)
      setRagasCarnatic(rc)
      setRagasHindustani(rh)
      setTalasCarnatic(tc)
      setTalasHindustani(th)
      const ragaRem = data.raga_remarks || ''
      const talaRem = data.tala_remarks || ''
      setRagaRemarks(ragaRem)
      setTalaRemarks(talaRem)
      const notesVal = data.notes || ''
      const durationVal = data.duration_minutes || ''
      const yearVal = data.year_of_recording || ''
      setNotes(notesVal)
      setDuration(durationVal)
      setYearOfRecording(yearVal)

      let lyMal = '', lyEng = '', meMal = '', meEng = ''
      try {
        const lyricsData = typeof data.lyrics === 'string' ? JSON.parse(data.lyrics) : data.lyrics || {}
        const meaningData = typeof data.meaning === 'string' ? JSON.parse(data.meaning) : data.meaning || {}
        lyMal = lyricsData.malayalam || ''
        lyEng = lyricsData.english || ''
        meMal = meaningData.malayalam || ''
        meEng = meaningData.english || ''
      } catch (e) {
        lyMal = data.lyrics || ''
        meMal = data.meaning || ''
      }
      setLyricsMalayalam(lyMal)
      setLyricsEnglish(lyEng)
      // Preserve any existing English (IAST) — don't auto-overwrite it.
      setEnglishManual(!!lyEng.trim())
      setMeaningMalayalam(meMal)
      setMeaningEnglish(meEng)

      const statusVal = data.status || 'draft'
      const holderVal = data.copyright_holder || 'Mata Amritanandamayi Math'
      const cstatusVal = data.copyright_status || 'pending'
      const licenseVal = data.license_type || 'proprietary'
      setStatus(statusVal)
      setCopyrightHolder(holderVal)
      setCopyrightStatus(cstatusVal)
      setLicenseType(licenseVal)

      const { data: writersData } = await supabase
        .from('bhajan_writers')
        .select('*')
        .eq('bhajan_id', id)

      let lyricistsList = [], composersList = []
      if (writersData && writersData.length > 0) {
        lyricistsList = writersData.filter(w => w.writer_role === 'lyricist').map(w => w.writer_name)
        composersList = writersData.filter(w => w.writer_role === 'composer').map(w => w.writer_name)
        setLyricists(lyricistsList)
        setComposers(composersList)
      }

      const { data: singersData } = await supabase
        .from('bhajan_singers')
        .select('*')
        .eq('bhajan_id', id)
      let singerNames = []
      if (singersData && singersData.length > 0) {
        singerNames = singersData.map(s => s.singer_name)
        setSingers(singerNames)
      }

      // Establish the autosave baseline from exactly what we loaded, so the
      // first edit (and only a real edit) triggers a save.
      lastSavedRef.current = makeSnapshot({
        name: data.name || '', theme: data.theme || '', language: data.language || '',
        originalBhajanId: data.original_bhajan_id || '',
        ragasCarnatic: rc, ragasHindustani: rh, talasCarnatic: tc, talasHindustani: th,
        ragaRemarks: ragaRem, talaRemarks: talaRem, notes: notesVal,
        duration_minutes: durationVal, year_of_recording: yearVal,
        lyrics_malayalam: lyMal, lyrics_english: lyEng,
        meaning_malayalam: meMal, meaning_english: meEng,
        status: statusVal, copyrightHolder: holderVal,
        copyrightStatus: cstatusVal, licenseType: licenseVal,
        lyricists: lyricistsList, composers: composersList, singers: singerNames,
      })

      await loadAudioFiles(data.bhajan_id)
    }

    setLoading(false)
  }

  const loadAudioFiles = async (folderId) => {
    if (!folderId) {
      setAudioFiles([])
      return
    }
    try {
      const { data, error } = await supabase.storage
        .from('bhajan-audio')
        .list(folderId)

      if (error) throw error

      if (data && data.length > 0) {
        const filesWithUrls = data
          // Oldest upload first → version numbers follow upload order. The
          // filename is prefixed with Date.now() at upload time.
          .map(file => ({ file, ts: parseInt((file.name.match(/^(\d+)-/) || [])[1], 10) || 0 }))
          .sort((a, b) => a.ts - b.ts)
          .map(({ file }) => {
            const path = `${folderId}/${file.name}`
            const { data: urlData } = supabase.storage
              .from('bhajan-audio')
              .getPublicUrl(path)
            return {
              name: file.name,
              displayName: file.name.replace(/^\d+-/, ''),
              url: urlData.publicUrl,
              path
            }
          })
        setAudioFiles(filesWithUrls)
      } else {
        setAudioFiles([])
      }
    } catch (err) {
      console.error('Error loading audio files:', err)
      setAudioFiles([])
    }
  }

  const handleAudioUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    if (!name) {
      showAlert('Please enter bhajan name first')
      return
    }

    setUploadingAudio(true)
    try {
      const tempBhajanId = bhajanId || generateBhajanId(name)

      for (const file of files) {
        const fileName = `${Date.now()}-${file.name}`
        const filePath = `${tempBhajanId}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('bhajan-audio')
          .upload(filePath, file, { upsert: false })

        if (uploadError) throw uploadError
      }

      e.target.value = ''
      await loadAudioFiles(tempBhajanId)
    } catch (err) {
      showAlert('Error uploading audio: ' + err.message)
    } finally {
      setUploadingAudio(false)
    }
  }

  const handleDeleteAudio = async (filePath) => {
    if (!(await showConfirm('Delete this audio file?', { title: 'Delete audio', confirmText: 'Delete', danger: true }))) return
    try {
      const { error } = await supabase.storage.from('bhajan-audio').remove([filePath])
      if (error) throw error
      setAudioFiles(prev => prev.filter(f => f.path !== filePath))
    } catch (err) {
      showAlert('Error deleting audio: ' + err.message)
    }
  }

  const regenerateMeanings = async () => {
    if (!lyrics_malayalam.trim()) {
      showAlert('Add Malayalam lyrics first — the meaning is generated from them.')
      return
    }
    if (meaning_malayalam.trim() || meaning_english.trim()) {
      const ok = await showConfirm('This will replace the current Malayalam and English meanings with AI-generated ones. Continue?', { title: 'Replace meanings', confirmText: 'Replace' })
      if (!ok) return
    }
    setGeneratingMeaning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { showAlert('Please log in again.'); return }
      const res = await fetch('/api/generate-meaning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ lyrics: lyrics_malayalam, language: language || 'Malayalam' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      setMeaningMalayalam(data.malayalam_meaning || '')
      setMeaningEnglish(data.english_meaning || '')
    } catch (err) {
      showAlert('Could not generate meaning: ' + err.message)
    } finally {
      setGeneratingMeaning(false)
    }
  }

  const saveBhajan = async ({ silent = false } = {}) => {
    if (!name) {
      if (!silent) showAlert('Enter bhajan name')
      return false
    }

    // Capture the state being persisted up front, so edits made during the
    // save aren't lost: this exact snapshot becomes the new autosave baseline.
    const snapAtSave = snapshot()

    if (silent) setAutoSaveStatus('saving')
    else setLoading(true)
    try {
      // The Name auto-fills in IAST from the Malayalam lyrics as they're typed.
      // As a safety net, if a new bhajan's Name still holds Malayalam script
      // (e.g. typed straight into the field), transliterate it to IAST on save.
      // Otherwise keep the Name exactly as shown so manual edits are preserved.
      const nameToSave = (!id && /[ഀ-ൿ]/.test(name)) ? toIASTTitle(name, lyrics_malayalam) : name
      if (nameToSave !== name) setName(nameToSave)
      const generatedBhajanId = bhajanId || generateBhajanId(nameToSave)
      const lyricsObj = { malayalam: lyrics_malayalam, english: lyrics_english }
      const meaningObj = { malayalam: meaning_malayalam, english: meaning_english }

      // Raga/Tala split by system (Carnatic / Hindustani), each a comma list
      // to allow ragamalika (more than one raga). The legacy single `raga`/`tala`
      // columns are mirrored to the display value (Carnatic, else Hindustani) so
      // any view still reading them stays correct.
      const ragaCarnaticStr = ragasCarnatic.join(', ')
      const ragaHindustaniStr = ragasHindustani.join(', ')
      const talaCarnaticStr = talasCarnatic.join(', ')
      const talaHindustaniStr = talasHindustani.join(', ')
      const ragaTalaFields = {
        raga_carnatic: ragaCarnaticStr,
        raga_hindustani: ragaHindustaniStr,
        tala_carnatic: talaCarnaticStr,
        tala_hindustani: talaHindustaniStr,
        raga_remarks: ragaRemarks,
        tala_remarks: talaRemarks,
        notes,
        raga: ragaCarnaticStr || ragaHindustaniStr,
        tala: talaCarnaticStr || talaHindustaniStr,
      }

      let savedId = id

      if (id) {
        const { error: updateError } = await supabase
          .from('bhajans')
          .update({
            name: nameToSave, theme, language, ...ragaTalaFields,
            duration_minutes: duration_minutes ? parseFloat(duration_minutes) : null,
            year_of_recording: year_of_recording ? parseInt(year_of_recording) : null,
            lyrics: JSON.stringify(lyricsObj),
            meaning: JSON.stringify(meaningObj),
            status,
            copyright_holder: copyrightHolder,
            copyright_status: copyrightStatus,
            license_type: licenseType,
            original_bhajan_id: originalBhajanId || null,
            updated_by: user?.id
          })
          .eq('id', id)

        if (updateError) throw updateError

        await supabase.from('bhajan_writers').delete().eq('bhajan_id', id)
        await supabase.from('bhajan_singers').delete().eq('bhajan_id', id)
      } else {
        const uniqueBhajanId = await getUniqueBhajanId(generatedBhajanId)
        const { data, error } = await supabase
          .from('bhajans')
          .insert([{
            bhajan_id: uniqueBhajanId,
            name: nameToSave, theme, language, ...ragaTalaFields,
            duration_minutes: duration_minutes ? parseFloat(duration_minutes) : null,
            year_of_recording: year_of_recording ? parseInt(year_of_recording) : null,
            lyrics: JSON.stringify(lyricsObj),
            meaning: JSON.stringify(meaningObj),
            status,
            copyright_holder: copyrightHolder,
            copyright_status: copyrightStatus,
            license_type: licenseType,
            original_bhajan_id: originalBhajanId || null,
            created_by: user?.id
          }])
          .select()

        if (error) throw error
        if (!data || data.length === 0) throw new Error('No data returned')
        savedId = data[0].id
        setBhajanId(uniqueBhajanId)
      }

      for (const lyricist of lyricists) {
        if (lyricist.trim()) {
          await supabase
            .from('bhajan_writers')
            .insert([{ bhajan_id: savedId, writer_name: lyricist, writer_role: 'lyricist' }])
        }
      }

      for (const composer of composers) {
        if (composer.trim()) {
          await supabase
            .from('bhajan_writers')
            .insert([{ bhajan_id: savedId, writer_name: composer, writer_role: 'composer' }])
        }
      }

      for (const singer of singers) {
        if (singer.trim()) {
          await supabase
            .from('bhajan_singers')
            .insert([{ bhajan_id: savedId, singer_name: singer }])
        }
      }

      // This state is now persisted — update the autosave baseline.
      lastSavedRef.current = snapAtSave

      // Activity log: record creation once, and at most one "updated" entry per
      // editing session (so frequent autosaves don't spam the log).
      if (!id) {
        logActivity(savedId, 'created', `Created “${nameToSave}”`)
        loggedThisSessionRef.current = true
      } else if (!loggedThisSessionRef.current) {
        logActivity(savedId, 'updated', `Updated “${nameToSave}”`)
        loggedThisSessionRef.current = true
      }

      if (silent) {
        setAutoSaveStatus('saved')
      } else if (!id) {
        // New bhajan just created — move into edit mode so autosave takes over
        // and the user stays in the form. The toast is rendered app-wide, so it
        // survives this navigation.
        showToast('Bhajan Saved')
        navigate(`/bhajan/${savedId}/edit`)
      } else {
        setAutoSaveStatus('saved')
        showToast('Bhajan Saved')
      }
      return true
    } catch (err) {
      if (silent) {
        setAutoSaveStatus('error')
        console.error('Autosave failed:', err)
      } else {
        showAlert('Error: ' + err.message)
      }
      return false
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const handleSave = () => saveBhajan({ silent: false })

  // Click on the backdrop (outside the form card) → confirm, then leave.
  const handleBackdropClick = (e) => {
    // Leave only for clicks on the backdrop around the form — never when the
    // click is on the form card, the floating Save/Cancel bar, or a dialog.
    if (e.target.closest('.form-card, .floating-save-bar, .bhajan-nav-arrow, .dialog-overlay')) return
    leaveForm()
  }

  const leaveForm = async () => {
    if (await showConfirm('Leave this form and go back to the dashboard?', { title: 'Leave form', confirmText: 'Leave', cancelText: 'Stay' })) {
      navigate('/dashboard')
    }
  }

  // Live count of matches for the current "find" term in the Malayalam lyrics.
  const lyricsMatchCount = (() => {
    if (!findText) return 0
    try {
      const re = new RegExp(escapeRegExp(findText), matchCase ? 'g' : 'gi')
      return (lyrics_malayalam.match(re) || []).length
    } catch {
      return 0
    }
  })()

  const replaceAllInLyrics = () => {
    if (!findText) return
    const re = new RegExp(escapeRegExp(findText), matchCase ? 'g' : 'gi')
    const next = lyrics_malayalam.replace(re, replaceText)
    setLyricsMalayalam(next)
    // Keep the English (IAST) field in step: re-transliterate when auto, else
    // mirror the Malayalam spacing onto the manually-edited English.
    if (!englishManual) setLyricsEnglish(malayalamToIAST(next))
    else if (lyrics_english.trim()) setLyricsEnglish(matchSpacing(next, lyrics_english))
    // Keep the auto-generated Name in step too, unless it was hand-edited.
    if (!nameManual) setName(toIASTTitle('', next))
  }

  return (
    <div className="form-container" onClick={handleBackdropClick}>
      <div className="form-card">
        <h1>{id ? 'Edit Bhajan' : 'Add Bhajan'}</h1>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Name *</span>
            {!nameManual && lyrics_malayalam.trim() && (
              <small style={{ color: '#888', fontWeight: 400 }}>Auto-generated (IAST) from Malayalam — edit to override</small>
            )}
          </label>
          <input value={name} onChange={(e) => { setName(e.target.value); setNameManual(true) }} placeholder="Bhajan name (auto-fills from Malayalam lyrics)" />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Theme</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">Select theme...</option>
              {themes.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
              {theme && !themes.some(t => t.name === theme) && (
                <option value={theme}>{theme} (legacy)</option>
              )}
            </select>
          </div>
        </div>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>
          Raga <span className="field-hint">(add more than one for ragamalika)</span>
        </h2>
        <div className="form-row">
          <div className="form-group">
            <label>Carnatic</label>
            <TagInput
              value={ragasCarnatic}
              options={suggestions.ragasCarnatic}
              onChange={setRagasCarnatic}
              placeholder="Carnatic raga(s)..."
            />
          </div>
          <div className="form-group">
            <label>Hindustani</label>
            <TagInput
              value={ragasHindustani}
              options={suggestions.ragasHindustani}
              onChange={setRagasHindustani}
              placeholder="Hindustani raga(s)..."
            />
          </div>
        </div>
        <div className="form-group">
          <label>Raga Remarks</label>
          <textarea
            value={ragaRemarks}
            onChange={(e) => setRagaRemarks(e.target.value)}
            rows="2"
            placeholder="Any other complexity or notes about the raga(s)..."
          />
        </div>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Tala</h2>
        <div className="form-row">
          <div className="form-group">
            <label>Carnatic</label>
            <TagInput
              value={talasCarnatic}
              options={suggestions.talasCarnatic}
              onChange={setTalasCarnatic}
              placeholder="Carnatic tala(s)..."
            />
          </div>
          <div className="form-group">
            <label>Hindustani</label>
            <TagInput
              value={talasHindustani}
              options={suggestions.talasHindustani}
              onChange={setTalasHindustani}
              placeholder="Hindustani tala(s)..."
            />
          </div>
        </div>
        <div className="form-group">
          <label>Tala Remarks</label>
          <textarea
            value={talaRemarks}
            onChange={(e) => setTalaRemarks(e.target.value)}
            rows="2"
            placeholder="Any other complexity or notes about the tala(s)..."
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Language</label>
            <ComboBox
              value={language}
              options={suggestions.languages}
              onChange={setLanguage}
              placeholder="Select or type a language..."
            />
          </div>
          <div className="form-group">
            <label>Linked Original Version</label>
            <BhajanSearch
              value={originalBhajanId}
              onChange={setOriginalBhajanId}
              excludeId={id}
              placeholder="Search for original bhajan (optional)..."
            />
          </div>
          <div className="form-group">
            <label>Duration (min)</label>
            <input type="number" value={duration_minutes} onChange={(e) => setDuration(e.target.value)} step="0.1" />
          </div>
          <div className="form-group">
            <label>Year of Recording</label>
            <input type="number" value={year_of_recording} onChange={(e) => setYearOfRecording(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Notes</h2>
        <div className="form-group">
          <label>Special notes / memories</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows="4"
            placeholder="Any special notes or memories about this bhajan..."
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Lyrics</h2>
          <button
            type="button"
            onClick={() => setShowFindReplace(v => !v)}
            title="Find and replace text in the Malayalam lyrics"
            style={{ fontSize: '0.78rem', fontWeight: 500, padding: '0.2rem 0.6rem', cursor: 'pointer',
                     border: '1px solid #c08a2b', borderRadius: '6px',
                     background: showFindReplace ? '#f5edd9' : 'transparent', color: '#c08a2b',
                     display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1em' }}>find_replace</span>
            Find &amp; Replace
          </button>
        </div>

        {showFindReplace && (
          <div className="find-replace-bar">
            <input
              className="fr-input"
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Find…"
            />
            <input
              className="fr-input"
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with…"
            />
            <label className="fr-case">
              <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
              Match case
            </label>
            <span className="fr-count">
              {findText ? `${lyricsMatchCount} match${lyricsMatchCount === 1 ? '' : 'es'}` : ''}
            </span>
            <button
              type="button"
              className="btn-primary fr-btn"
              onClick={replaceAllInLyrics}
              disabled={!findText || lyricsMatchCount === 0}
            >
              Replace all
            </button>
          </div>
        )}

        <div className="form-group">
          <label>Malayalam</label>
          <AutoTextarea
            value={lyrics_malayalam}
            onChange={(e) => {
              const mal = e.target.value
              setLyricsMalayalam(mal)
              // Auto-fill the English (IAST) field until it's hand-edited; once
              // manual, still mirror the Malayalam stanza spacing onto it.
              if (!englishManual) setLyricsEnglish(malayalamToIAST(mal))
              else if (lyrics_english.trim()) setLyricsEnglish(matchSpacing(mal, lyrics_english))
              // Auto-generate the IAST Name from the first Malayalam line until
              // the Name is hand-edited (new bhajans only — existing are manual).
              if (!nameManual) setName(toIASTTitle('', mal))
            }}
            minHeight="9rem"
            placeholder="Malayalam lyrics"
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>English (IAST)</span>
            <button
              type="button"
              onClick={() => { setLyricsEnglish(malayalamToIAST(lyrics_malayalam)); setEnglishManual(false) }}
              title="Regenerate the English (IAST) transliteration from the Malayalam lyrics"
              style={{ fontSize: '0.78rem', fontWeight: 500, padding: '0.2rem 0.6rem', cursor: 'pointer',
                       border: '1px solid #c08a2b', borderRadius: '6px', background: 'transparent', color: '#c08a2b' }}
            >
              ⟳ Sync from Malayalam
            </button>
          </label>
          <AutoTextarea
            value={lyrics_english}
            onChange={(e) => { setLyricsEnglish(e.target.value); setEnglishManual(true) }}
            minHeight="9rem"
            placeholder="Auto-filled from Malayalam (IAST) — edit to override"
          />
          {englishManual && lyrics_malayalam.trim() && (
            <small style={{ color: '#888' }}>Manual edit — auto-sync paused. Use “Sync from Malayalam” to regenerate.</small>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Meaning & Translation</h2>
          <button
            type="button"
            onClick={regenerateMeanings}
            disabled={generatingMeaning}
            title="Generate the Malayalam and English meanings from the Malayalam lyrics using AI"
            style={{ fontSize: '0.82rem', fontWeight: 500, padding: '0.4rem 0.8rem',
                     cursor: generatingMeaning ? 'wait' : 'pointer', border: '1px solid #c08a2b',
                     borderRadius: '6px', background: generatingMeaning ? '#f5edd9' : 'transparent', color: '#c08a2b' }}
          >
            <span className="material-symbols-outlined">auto_awesome</span>
            {generatingMeaning ? ' Generating…' : ' Generate meanings from lyrics'}
          </button>
        </div>
        <div className="form-group">
          <label>Malayalam</label>
          <AutoTextarea
            value={meaning_malayalam}
            onChange={(e) => {
              const mal = e.target.value
              setMeaningMalayalam(mal)
              // Mirror the Malayalam meaning's paragraph spacing onto the English
              // meaning (words untouched) so the two stay visually aligned.
              if (meaning_english.trim()) setMeaningEnglish(matchSpacing(mal, meaning_english))
            }}
            minHeight="5rem"
            placeholder="Malayalam meaning"
          />
        </div>

        <div className="form-group">
          <label>English</label>
          <AutoTextarea value={meaning_english} onChange={(e) => setMeaningEnglish(e.target.value)} minHeight="5rem" placeholder="English meaning/translation" />
        </div>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Contributors</h2>
        <div className="form-row">
          {[
            { title: 'Lyricists', items: lyricists, setItems: setLyricists, singular: 'Lyricist' },
            { title: 'Composers', items: composers, setItems: setComposers, singular: 'Composer' },
            { title: 'Singers', items: singers, setItems: setSingers, singular: 'Singer' }
          ].map(({ title, items, setItems, singular }) => (
            <div key={title} className="form-group">
              <label>{title}</label>
              <ContributorMultiSelect
                value={items}
                contributors={contributors}
                placeholder={`Search ${singular.toLowerCase()}...`}
                onChange={setItems}
              />
            </div>
          ))}
        </div>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Audio Files</h2>
        <div className="form-group">
          <div className="audio-upload-wrapper">
            <input
              id="audio-upload"
              className="audio-file-input"
              type="file"
              accept="audio/*"
              multiple
              onChange={handleAudioUpload}
              disabled={uploadingAudio}
            />
            <label htmlFor="audio-upload" className="audio-upload-label">
              <span className="upload-icon material-symbols-outlined">upload_file</span>
              <span className="upload-text">
                {uploadingAudio ? 'Uploading...' : 'Click to upload audio'}
              </span>
              <span className="upload-hint">MP3, WAV, M4A — you can select multiple files</span>
            <span className="upload-hint" style={{ marginTop: '0.4rem', color: '#d6a84f' }}><span className="material-symbols-outlined" style={{ fontSize: '1em' }}>lightbulb</span> Tip: convert/compress to MP3 (~128 kbps) before uploading to save storage</span>
            </label>
          </div>
        </div>

        {audioFiles.length > 0 && (
          <div className="audio-files-list">
            {audioFiles.map((file, index) => (
              <AudioPlayer
                key={file.path}
                fileName={file.displayName}
                fileUrl={file.url}
                onDelete={() => handleDeleteAudio(file.path)}
                allowDownload={userRole === 'admin'}
                version={index + 1}
              />
            ))}
          </div>
        )}

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Copyright</h2>
        <div className="copyright-card">
          <div className="copyright-row">
            <div className="copyright-item">
              <label>Copyright Holder</label>
              <input
                className="copyright-select"
                value={copyrightHolder}
                onChange={(e) => setCopyrightHolder(e.target.value)}
                placeholder="Mata Amritanandamayi Math"
              />
            </div>
            <div className="copyright-item">
              <label>Copyright Status</label>
              <select
                className="copyright-select"
                value={copyrightStatus}
                onChange={(e) => setCopyrightStatus(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            <div className="copyright-item">
              <label>License Type</label>
              <select
                className="copyright-select"
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value)}
              >
                <option value="proprietary">Proprietary</option>
                <option value="cc-by">Creative Commons BY</option>
                <option value="cc-by-sa">Creative Commons BY-SA</option>
              </select>
            </div>
          </div>
          <div className="noc-button-wrapper">
            <button
              type="button"
              className="btn-noc"
              onClick={() => setShowNOC(true)}
              disabled={!id}
              title={id ? 'Generate No Objection Certificate' : 'Save the bhajan first to generate an NOC'}
            >
              <span className="material-symbols-outlined">description</span> Generate No Objection Certificate (NOC)
            </button>
            {!id && (
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.5rem', textAlign: 'center' }}>
                Save the bhajan first to generate an NOC.
              </p>
            )}
          </div>
        </div>

        {showNOC && id && (
          <NOCGenerator
            bhajanId={id}
            bhajanName={name}
            onClose={() => setShowNOC(false)}
          />
        )}

      </div>

      {/* Quick navigation to the previous / next bhajan without leaving the
          edit view. Only while editing an existing bhajan. */}
      {id && prevId && (
        <button
          type="button"
          className="bhajan-nav-arrow prev"
          onClick={() => goToBhajan(prevId)}
          title="Previous bhajan (saves automatically)"
          aria-label="Previous bhajan"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
      )}
      {id && nextId && (
        <button
          type="button"
          className="bhajan-nav-arrow next"
          onClick={() => goToBhajan(nextId)}
          title="Next bhajan (saves automatically)"
          aria-label="Next bhajan"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      )}

      <div className="floating-save-bar">
        {id && (
          <span className={`autosave-status autosave-${autoSaveStatus}`}>
            {autoSaveStatus === 'pending' && <><span className="material-symbols-outlined">edit</span> Unsaved changes…</>}
            {autoSaveStatus === 'saving' && <><span className="material-symbols-outlined">sync</span> Saving…</>}
            {autoSaveStatus === 'saved' && <><span className="material-symbols-outlined">check_circle</span> All changes saved</>}
            {autoSaveStatus === 'error' && <><span className="material-symbols-outlined">error</span> Couldn’t save — check connection</>}
          </span>
        )}
        <button onClick={handleSave} disabled={loading || uploadingAudio} className="btn-primary floating-save-btn" type="button">
          {loading ? 'Saving…' : id ? 'Save' : 'Create'}
        </button>
        <button onClick={() => leaveForm()} className="btn-secondary floating-cancel-btn" type="button">
          Cancel
        </button>
      </div>
    </div>
  )
}

async function logActivity(bhajanId, action, description, changedFields = []) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activity_log').insert([{
      bhajan_id: bhajanId,
      action,
      description,
      changed_fields: changedFields,
      changed_by: user?.id
    }])
  } catch (err) {
    console.log('Error logging activity:', err)
  }
}

export default BhajanForm
