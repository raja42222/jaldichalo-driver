import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/* ================================================================
   Google Setup — Driver App
   Shows FULL registration form (same as AuthPage driver-v step)
   Google users must also submit documents before getting approved
================================================================ */

const isValidPhone     = n => /^[6-9]\d{9}$/.test(n)
const isValidLicenseNo = n => { const c = n.replace(/[\s\-\/]/g,'').toUpperCase(); return c.length >= 9 && /^[A-Z]{2}/.test(c) }
const isValidVehicleNo = n => { const c = n.replace(/[\s\-]/g,'').toUpperCase(); return c.length >= 6 && /^[A-Z]{2}/.test(c) }

async function uploadDoc(file, userId, docKey) {
  const ext  = file.name.split('.').pop().toLowerCase()
  const path = `drivers/${userId}/${docKey}_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('driver-documents').upload(path, file, { upsert:true })
  if (error) throw error
  const { data:{ publicUrl } } = supabase.storage.from('driver-documents').getPublicUrl(path)
  return publicUrl
}

export default function GoogleSetup() {
  const { oauthUser, setProfileDirect, signOut } = useAuth()

  const [name,    setName]    = useState(oauthUser?.user_metadata?.full_name || '')
  const [phone,   setPhone]   = useState('')
  const [vehicle, setVehicle] = useState('bike')
  const [vehicleModel, setVM] = useState('')
  const [vehicleNo,    setVN] = useState('')
  const [licenseNo,    setLN] = useState('')
  const [plateConfirmed, setPC] = useState(false)
  const [licenseConfirmed, setLC] = useState(false)
  const [docs, setDocs] = useState({
    license:      { file:null, url:null, uploading:false, done:false },
    vehicle_plate:{ file:null, url:null, uploading:false, done:false },
    rc:           { file:null, url:null, uploading:false, done:false },
    photo:        { file:null, url:null, uploading:false, done:false },
  })
  const [loading, setLoading] = useState(false)
  const [phoneAlreadyTaken, setPhoneAlreadyTaken] = useState(false)
  const [error,   setError]   = useState('')
  const [licErr,  setLicErr]  = useState('')
  const [platErr, setPlatErr] = useState('')
  const fileRefs = useRef({})
  const email = oauthUser?.email || ''

  async function handleDocUpload(docKey, file) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('File too large (max 10MB)'); return }
    setDocs(p => ({ ...p, [docKey]:{ ...p[docKey], uploading:true, done:false } }))
    try {
      const user = (await supabase.auth.getUser()).data?.user
      const url  = user ? await uploadDoc(file, user.id, docKey) : URL.createObjectURL(file)
      setDocs(p => ({ ...p, [docKey]:{ file, url, uploading:false, done:true } }))
    } catch {
      setDocs(p => ({ ...p, [docKey]:{ ...p[docKey], uploading:false, done:false } }))
      setError('Upload failed. Please try again.')
    }
  }

  const DocUpload = ({ docKey, label, hint, required }) => (
    <div style={{ marginBottom:8 }}>
      <input ref={el=>fileRefs.current[docKey]=el} type="file" accept="image/*,application/pdf"
        style={{ display:'none' }} onChange={e=>handleDocUpload(docKey,e.target.files[0])} />
      <button onClick={()=>fileRefs.current[docKey]?.click()}
        style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:`2px solid ${docs[docKey]?.done?'#16A34A':'#E0E0E0'}`, background:docs[docKey]?.done?'#ECFDF5':'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:10, fontSize:13, fontWeight:600 }}>
        <span style={{ fontSize:20 }}>{docs[docKey]?.done?'✅':'📎'}</span>
        <div style={{ flex:1, textAlign:'left' }}>
          <div style={{ color:docs[docKey]?.done?'#16A34A':'#555' }}>
            {docs[docKey]?.uploading ? 'Uploading...' : docs[docKey]?.done ? `✓ ${label}` : `Upload ${label}`}
          </div>
          {hint && !docs[docKey]?.done && <div style={{ fontSize:11, color:'#888', marginTop:1 }}>{hint}</div>}
        </div>
        {required && !docs[docKey]?.done && <span style={{ color:'#EF4444', fontSize:11, fontWeight:700 }}>Required</span>}
      </button>
      {docs[docKey]?.done && docs[docKey]?.url && (
        <img src={docs[docKey].url} alt="" style={{ width:'100%', height:100, objectFit:'cover', borderRadius:8, marginTop:6, border:'1px solid #E0E0E0' }} />
      )}
    </div>
  )

  async function save() {
    setLicErr(''); setPlatErr(''); setError('')
    if (!name.trim())                  { setError('Enter your name'); return }
    if (!isValidPhone(phone))          { setError('Enter a valid 10-digit mobile number'); return }
    if (!vehicleModel.trim())          { setError('Enter vehicle model'); return }
    if (!isValidVehicleNo(vehicleNo))  { setPlatErr('Enter valid vehicle number (e.g. WB01AB1234)'); return }
    if (!isValidLicenseNo(licenseNo))  { setLicErr('Enter valid licence number (min 9 chars, starts with state code)'); return }
    if (!docs.license.done)            { setError('Upload your driving licence photo'); return }
    if (!docs.vehicle_plate.done)      { setError('Upload your vehicle plate photo'); return }
    if (!licenseConfirmed)             { setError('Confirm that licence photo matches licence number'); return }
    if (!plateConfirmed)               { setError('Confirm that plate photo matches vehicle number'); return }

    setLoading(true)
    try {
      // -- Layer 1: Check if phone already registered as DRIVER --
      const { data: drvCheck } = await supabase
        .from('drivers')
        .select('id')
        .eq('phone', `+91${phone}`)
        .neq('id', oauthUser.id)
        .maybeSingle()
      if (drvCheck) {
        setError('⚠️ This number is already registered as a driver. Please sign in with this number instead.')
        setPhoneAlreadyTaken(true)
        setLoading(false); return
      }

      // -- Layer 2: Check if phone already registered as PASSENGER --
      const { data: paxCheck } = await supabase
        .from('passengers')
        .select('id')
        .eq('phone', `+91${phone}`)
        .maybeSingle()
      if (paxCheck) {
        setError('⚠️ This number is registered as a customer. You can still register as a driver, but please use a different number, or use the same number to register.')
        setLoading(false); return
      }

      const { data:rpcData, error:rpcErr } = await supabase.rpc('upsert_driver', {
        p_id:               oauthUser.id,
        p_name:             name.trim(),
        p_phone:            `+91${phone}`,
        p_email:            email||null,
        p_vehicle_type:     vehicle,
        p_vehicle_model:    vehicleModel.trim(),
        p_vehicle_number:   vehicleNo.trim(),
        p_license_url:      docs.license.url,
        p_vehicle_plate_url:docs.vehicle_plate.url,
        p_rc_url:           docs.rc.url || null,
      })
      if (rpcErr || rpcData?.success === false) {
        if (rpcData?.error === 'phone_taken') {
          setError(rpcData.message || 'Phone already registered.')
          setLoading(false); return
        }
        const { error:insErr } = await supabase.from('drivers').upsert({
          id:                 oauthUser.id,
          name:               name.trim(),
          phone:              `+91${phone}`,
          email:              email||null,
          vehicle_type:       vehicle,
          vehicle_model:      vehicleModel.trim(),
          vehicle_number:     vehicleNo.trim(),
          license_url:        docs.license.url,
          vehicle_plate_url:  docs.vehicle_plate.url,
          rc_url:             docs.rc.url || null,
          profile_photo_url:  docs.photo.url || null,
          status:             'pending',
          login_method:       'google',
        }, { onConflict:'id' })
        if (insErr) { setError(insErr.message); setLoading(false); return }
      }
      setLoading(false)
      setProfileDirect({
        id: oauthUser.id, name: name.trim(),
        phone: `+91${phone}`, email: email||null,
        vehicle_type: vehicle, vehicle_model: vehicleModel.trim(),
        vehicle_number: vehicleNo.trim(),
        license_url: docs.license.url,
        vehicle_plate_url: docs.vehicle_plate.url,
        status: 'pending', is_online: false,
        rating: 5.00, total_rides: 0, login_method: 'google',
      })
    } catch(e) { setError(e.message||'Something went wrong.'); setLoading(false) }
  }

  const canSubmit = name.trim() && isValidPhone(phone) && vehicleModel.trim() &&
    isValidVehicleNo(vehicleNo) && isValidLicenseNo(licenseNo) &&
    docs.license.done && docs.vehicle_plate.done && licenseConfirmed && plateConfirmed

  return (
    <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#16A34A,#22C55E)', padding:'calc(env(safe-area-inset-top,0px)+14px) 20px 20px', flexShrink:0, color:'#fff' }}>
        <div style={{ fontWeight:800, fontSize:20, marginBottom:2 }}>Complete Driver Profile</div>
        <div style={{ fontSize:13, opacity:0.9 }}>{email}</div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 20px 40px' }}>

        {/* Name + Phone */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#555', marginBottom:6 }}>Full Name *</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name"
              style={{ padding:'13px 16px', borderRadius:14, border:`2px solid ${name.trim()?'#16A34A':'#E0E0E0'}`, fontSize:15, background:'#fff', outline:'none', fontFamily:'inherit', color:'#111', width:'100%' }} />
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#555', marginBottom:6 }}>Mobile Number *</div>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ padding:'13px 16px', background:'#F5F5F5', borderRadius:14, fontWeight:700, fontSize:14 }}>🇮🇳 +91</div>
              <input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,'').slice(0,10))}
                placeholder="10-digit number" type="tel" inputMode="numeric"
                style={{ flex:1, padding:'13px 16px', borderRadius:14, border:`2px solid ${isValidPhone(phone)?'#16A34A':'#E0E0E0'}`, fontSize:15, background:'#fff', outline:'none', fontFamily:'inherit' }} />
            </div>
          </div>
        </div>

        {/* Vehicle type */}
        <div style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'#555' }}>Vehicle Type *</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
          {[{id:'bike',e:'🏍️',l:'Bike'},{id:'auto',e:'🛺',l:'Auto'},{id:'cab',e:'🚗',l:'Cab Non-AC'},{id:'cab-ac',e:'❄️',l:'Cab AC'}].map(v=>(
            <button key={v.id} onClick={()=>setVehicle(v.id)}
              style={{ padding:'12px', borderRadius:12, border:`2px solid ${vehicle===v.id?'#16A34A':'#E0E0E0'}`, background:vehicle===v.id?'#ECFDF5':'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <span style={{ fontSize:24 }}>{v.e}</span>
              <span style={{ fontSize:12, fontWeight:700, color:vehicle===v.id?'#16A34A':'#555' }}>{v.l}</span>
            </button>
          ))}
        </div>

        {/* Vehicle details */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#555', marginBottom:6 }}>Vehicle Model *</div>
            <input value={vehicleModel} onChange={e=>setVM(e.target.value)} placeholder="e.g. Honda Activa 6G"
              style={{ padding:'13px 16px', borderRadius:14, border:`2px solid ${vehicleModel.trim()?'#16A34A':'#E0E0E0'}`, fontSize:15, background:'#fff', outline:'none', fontFamily:'inherit', color:'#111', width:'100%' }} />
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#555', marginBottom:6 }}>Vehicle Number Plate *</div>
            <input value={vehicleNo} onChange={e=>setVN(e.target.value.replace(/\s/g,'').toUpperCase())}
              placeholder="e.g. WB01AB1234"
              style={{ padding:'13px 16px', borderRadius:14, border:`2px solid ${isValidVehicleNo(vehicleNo)?'#16A34A':'#E0E0E0'}`, fontSize:15, fontWeight:700, letterSpacing:'0.07em', background:'#fff', outline:'none', fontFamily:'inherit', color:'#111', width:'100%' }} />
            {platErr && <div style={{ color:'#DC2626', fontSize:11, marginTop:4 }}>{platErr}</div>}
          </div>
        </div>

        {/* Plate photo */}
        <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, padding:'12px 14px', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#92400E', marginBottom:8 }}>📸 Vehicle Plate Photo (Required)</div>
          <DocUpload docKey="vehicle_plate" label="Vehicle + Number Plate" required />
          {docs.vehicle_plate.done && (
            <div onClick={()=>setPC(!plateConfirmed)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px', background:'#fff', borderRadius:10, cursor:'pointer', marginTop:8 }}>
              <div style={{ width:20, height:20, border:`2px solid ${plateConfirmed?'#16A34A':'#E0E0E0'}`, borderRadius:5, background:plateConfirmed?'#16A34A':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {plateConfirmed && <span style={{ color:'#fff', fontSize:12 }}>✓</span>}
              </div>
              <span style={{ fontSize:12, color:'#555' }}>Photo matches plate: <strong>{vehicleNo||'...'}</strong></span>
            </div>
          )}
        </div>

        {/* Licence */}
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'12px 14px', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#16A34A', marginBottom:8 }}>🪪 Driving Licence (Required)</div>
          <div style={{ marginBottom:10 }}>
            <input value={licenseNo} onChange={e=>setLN(e.target.value.replace(/\s/g,'').toUpperCase())}
              placeholder="e.g. WB0120201234567"
              style={{ padding:'13px 16px', borderRadius:14, border:`2px solid ${isValidLicenseNo(licenseNo)?'#16A34A':'#E0E0E0'}`, fontSize:14, fontWeight:700, letterSpacing:'0.05em', background:'#fff', outline:'none', fontFamily:'inherit', color:'#111', width:'100%' }} />
            <div style={{ fontSize:11, color:'#888', marginTop:4 }}>State + RTO + Year + Serial number</div>
            {licErr && <div style={{ color:'#DC2626', fontSize:11, marginTop:4 }}>{licErr}</div>}
          </div>
          <DocUpload docKey="license" label="Licence Front Photo" hint="Must show licence number clearly" required />
          {docs.license.done && licenseNo.length >= 9 && (
            <div onClick={()=>setLC(!licenseConfirmed)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px', background:'#fff', borderRadius:10, cursor:'pointer', marginTop:8 }}>
              <div style={{ width:20, height:20, border:`2px solid ${licenseConfirmed?'#16A34A':'#E0E0E0'}`, borderRadius:5, background:licenseConfirmed?'#16A34A':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {licenseConfirmed && <span style={{ color:'#fff', fontSize:12 }}>✓</span>}
              </div>
              <span style={{ fontSize:12, color:'#555' }}>Licence number <strong>{licenseNo}</strong> matches photo</span>
            </div>
          )}
        </div>

        {/* RC Book */}
        <div style={{ marginBottom:12 }}>
          <DocUpload docKey="rc" label="RC Book (Registration Certificate)" hint="Optional but recommended" />
        </div>

        {error && (
          <div style={{ marginBottom:14, padding:'12px 14px', background:'#FEF2F2', borderRadius:12, border:'1px solid #FECACA' }}>
            <div style={{ color:'#DC2626', fontSize:13, fontWeight:600, marginBottom: phoneAlreadyTaken ? 10 : 0 }}>{error}</div>
            {phoneAlreadyTaken && (
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <button onClick={() => { setPhoneAlreadyTaken(false); setError(''); setPhone('') }}
                  style={{ flex:1, padding:'8px', borderRadius:10, border:'1.5px solid #DC2626', background:'transparent', color:'#DC2626', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                  Use different number
                </button>
                <button onClick={signOut}
                  style={{ flex:1, padding:'8px', borderRadius:10, border:'none', background:'#16A34A', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                  Sign in with phone
                </button>
              </div>
            )}
          </div>
        )}

        <button onClick={save} disabled={loading || !canSubmit}
          style={{ width:'100%', padding:'15px', borderRadius:16, background:loading||!canSubmit?'#E0E0E0':'linear-gradient(135deg,#16A34A,#22C55E)', color:loading||!canSubmit?'#999':'#fff', fontWeight:800, fontSize:16, border:'none', cursor:loading||!canSubmit?'default':'pointer', fontFamily:'inherit', marginBottom:10 }}>
          {loading ? 'Submitting...' : 'Submit Application ->'}
        </button>

        <button onClick={signOut} style={{ width:'100%', padding:'12px', borderRadius:14, border:'1.5px solid #E0E0E0', background:'transparent', color:'#888', fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>
          Cancel and sign out
        </button>

        <div style={{ marginTop:12, padding:'12px', background:'#ECFDF5', borderRadius:12, fontSize:12, color:'#16A34A', lineHeight:1.6 }}>
          Your application will be reviewed within 24 hours.
        </div>
      </div>
    </div>
  )
}
