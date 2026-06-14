import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../config/supabase'
import Spinner from './Spinner'
import '../styles/NOCGenerator.css'

function NOCGenerator({ bhajanId, bhajanName, onClose }) {
  const [bhajan, setBhajan] = useState(null)
  const [contributors, setContributors] = useState([])
  const [loading, setLoading] = useState(true)
  const [nocContent, setNocContent] = useState('')
  const [isAmmaCreator, setIsAmmaCreator] = useState(false)
  const [useSingular, setUseSingular] = useState(false)

  useEffect(() => {
    loadNOCData()
  }, [bhajanId])

  const loadNOCData = async () => {
    setLoading(true)
    try {
      const { data: bhajanData } = await supabase
        .from('bhajans')
        .select('*')
        .eq('id', bhajanId)
        .single()

      if (!bhajanData) {
        setLoading(false)
        return
      }
      setBhajan(bhajanData)

      // Lyricists/Composers entered on the bhajan form
      const { data: writers } = await supabase
        .from('bhajan_writers')
        .select('writer_name, writer_role')
        .eq('bhajan_id', bhajanId)

      // Contributors explicitly linked via the registry (older bhajans)
      const { data: bhajanContributors } = await supabase
        .from('bhajan_contributors')
        .select('contributor_id, role')
        .eq('bhajan_id', bhajanId)

      // Full registry, used to enrich names with signature/contact details
      const { data: registry } = await supabase
        .from('contributors')
        .select('id, name, email, phone, address, id_proof_type, id_proof_number, signature_url')

      const reg = registry || []
      const byId = {}
      const byName = {}
      reg.forEach(c => {
        byId[c.id] = c
        if (c.name) byName[c.name.trim().toLowerCase()] = c
      })

      // Merge both sources, keep only lyricists/composers, dedupe by name+role
      const map = new Map()
      const addEntry = (rawName, role, details) => {
        if (!rawName || !role || role === 'singer') return
        const name = rawName.trim()
        const key = name.toLowerCase() + '|' + role
        if (map.has(key)) return
        map.set(key, {
          name,
          role,
          email: details?.email || '',
          phone: details?.phone || '',
          address: details?.address || '',
          id_proof_type: details?.id_proof_type || '',
          id_proof_number: details?.id_proof_number || '',
          signature_url: details?.signature_url || ''
        })
      }

      ;(writers || []).forEach(w =>
        addEntry(w.writer_name, w.writer_role, byName[(w.writer_name || '').trim().toLowerCase()])
      )
      ;(bhajanContributors || []).forEach(bc => {
        const c = byId[bc.contributor_id]
        if (c) addEntry(c.name, bc.role, c)
      })

      const enrichedContributors = Array.from(map.values())

      setContributors(enrichedContributors)
      setUseSingular(enrichedContributors.length === 1)

      const ammaIsCreator = enrichedContributors.some(c =>
        (c.name?.toLowerCase().includes('mata amritanandamayi') ||
         c.name?.toLowerCase() === 'amma') &&
        (c.role === 'lyricist' || c.role === 'composer')
      )
      setIsAmmaCreator(ammaIsCreator)

      const noc = generateNOCText(bhajanData.name, enrichedContributors, ammaIsCreator, enrichedContributors.length === 1)
      setNocContent(noc)
    } catch (err) {
      console.error('Error loading NOC data:', err)
    }
    setLoading(false)
  }

  const generateNOCText = (name, contribs, ammaCreator, singular) => {
    if (ammaCreator) {
      return generateTemplate2(name, contribs, singular)
    } else {
      return generateTemplate1(name, contribs, singular)
    }
  }

  const generateTemplate1 = (name, contribs, singular) => {
    const pronoun1 = singular ? 'I' : 'We'
    const pronoun2 = singular ? 'my' : 'our'
    const pronoun3 = singular ? 'me' : 'us'
    const verb = singular ? 'am' : 'are'

    const roles = [...new Set(contribs.map(c => c.role))].sort().join(' and ')

    return `NO OBJECTION CERTIFICATE

To Whom It May Concern,

${pronoun1}, the undersigned contributor${singular ? '' : 's'} to the bhajan titled "${name}", hereby grant ${pronoun2} No Objection Certificate to Mata Amritanandamayi Math for the purpose of copyright registration and publication.

${singular ? 'I confirm that I have contributed to this bhajan in the following capacity:' : 'We confirm that we have contributed to this bhajan in the following capacities:'}
- ${roles.charAt(0).toUpperCase() + roles.slice(1)}

${pronoun1} hereby declare that:

1. ${pronoun1} ${verb} the rightful contributor${singular ? '' : 's'} to this bhajan as stated above.

2. ${pronoun1} have${singular ? '' : ''} no objection to Mata Amritanandamayi Math being registered as the Publisher/Author for copyright purposes.

3. ${pronoun1} grant full consent for the use, publication, reproduction, distribution, digital dissemination, archival, and all related official use of this bhajan by Mata Amritanandamayi Math.

4. ${pronoun1} shall not raise any claim, objection, or dispute against Mata Amritanandamayi Math regarding the copyright submission or registration of this bhajan based on ${pronoun2} respective contributions.

5. ${pronoun1} understand${singular ? '' : ''} that this NOC is issued voluntarily for submission to copyright authorities and for all related institutional purposes.

This NOC is issued on a voluntary basis and serves as ${pronoun2} authorization for Mata Amritanandamayi Math to proceed with copyright registration of the aforementioned bhajan.`
  }

  const generateTemplate2 = (name, contribs, singular) => {
    const roles = [...new Set(contribs.map(c => c.role))].sort().join(' and ')
    const roleText = roles.includes(' and ') ? 'written and composed' : (roles === 'lyricist' ? 'written' : 'composed')

    return `NO OBJECTION CERTIFICATE

To Whom It May Concern,

I, Mata Amritanandamayi Devi, having ${roleText} this bhajan titled "${name}", hereby grant my No Objection Certificate to Mata Amritanandamayi Math for the purpose of copyright registration, publication, and all related institutional use.

I hereby declare that:

1. I am the rightful ${roles} of this bhajan.

2. I have no objection to Mata Amritanandamayi Math being registered as the Publisher/Author for copyright purposes.

3. I grant full consent for the use, publication, reproduction, distribution, digital dissemination, archival, and all related official use of this bhajan by Mata Amritanandamayi Math.

4. I shall not raise any claim, objection, or dispute against Mata Amritanandamayi Math regarding the copyright submission or registration of this bhajan.

5. I voluntarily authorize Mata Amritanandamayi Math to manage and administer this bhajan for all institutional and spiritual purposes.`
  }

  const handlePrint = () => {
    const original = document.title
    const safeName = (bhajanName || 'Bhajan').trim().replace(/[\\/:*?"<>|]+/g, ' ').trim()
    document.title = `NOC - ${safeName}`
    const restore = () => {
      document.title = original
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
    // Fallback in case afterprint does not fire
    setTimeout(restore, 1000)
  }

  if (loading) {
    return createPortal(
      <div className="noc-modal-overlay" onClick={onClose}>
        <div className="noc-modal" onClick={(e) => e.stopPropagation()}>
          <div className="noc-modal-header">
            <h2>No Objection Certificate</h2>
            <button className="noc-close" onClick={onClose}>✕</button>
          </div>
          <Spinner label="Generating NOC" />
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div className="noc-modal-overlay" onClick={onClose}>
      <div className="noc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="noc-modal-header">
          <h2>No Objection Certificate</h2>
          <button className="noc-close" onClick={onClose}>✕</button>
        </div>

        <div className="noc-modal-actions">
          <button
            onClick={handlePrint}
            className="noc-btn-print"
          >
            <span className="material-symbols-outlined">print</span> Print / Save as PDF
          </button>
          <button onClick={onClose} className="noc-btn-close">
            Close
          </button>
        </div>

        <div className="noc-document">
          <div className="noc-letterhead">
            <img
              src="/mam-letterhead.png"
              alt="Mata Amritanandamayi Math, Amritapuri, Kollam, Kerala, India - 690 546"
              className="noc-letterhead-img"
            />
          </div>
          <h1 className="noc-title">No Objection Certificate</h1>
          <div className="noc-content">
            {nocContent.replace(/^NO OBJECTION CERTIFICATE\s*\n+/i, '').split('\n').filter(line => line.trim()).map((line, idx) => (
              <p key={idx}>{line || ' '}</p>
            ))}
          </div>

          {!isAmmaCreator && contributors.length > 0 && (
            <div className="noc-contributors-section">
              <h3>Details and Signatures of Contributors</h3>
              {contributors.map((contrib, idx) => (
                <div key={idx} className="noc-contributor">
                  <p><strong>Contributor {idx + 1}: {contrib.name}</strong></p>
                  <p>Role: <strong>{contrib.role.charAt(0).toUpperCase() + contrib.role.slice(1)}</strong></p>
                  {contrib.address && <p>Address: {contrib.address}</p>}
                  {contrib.phone && <p>Phone: {contrib.phone}</p>}
                  {contrib.email && <p>Email: {contrib.email}</p>}
                  {contrib.id_proof_type && <p>ID Type: {contrib.id_proof_type} | ID Number: {contrib.id_proof_number}</p>}
                  
                  {contrib.signature_url && (
                    <div className="noc-signature">
                      <p><strong>Signature:</strong></p>
                      <img src={contrib.signature_url} alt={`${contrib.name} signature`} />
                    </div>
                  )}
                  <hr style={{ marginTop: '1.5rem', marginBottom: '1.5rem', borderColor: '#2a2a30' }} />
                </div>
              ))}
            </div>
          )}

          <div className="noc-signatory-section">
            <h3>For Mata Amritanandamayi Math</h3>
            <p>Authorized Signatory Name: ___________________________</p>
            <p>Designation: ___________________________</p>
            <p>Signature & Seal: ___________________________</p>
            <p>Date: ___________________________</p>
          </div>

          <div className="noc-witnesses-section">
            <h3>Witnesses</h3>
            <div className="noc-witness">
              <p><strong>Witness 1</strong></p>
              <p>Name: ___________________________</p>
              <p>Contact: ___________________________</p>
              <p>Signature: ___________________________</p>
            </div>
            <div className="noc-witness">
              <p><strong>Witness 2</strong></p>
              <p>Name: ___________________________</p>
              <p>Contact: ___________________________</p>
              <p>Signature: ___________________________</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default NOCGenerator
