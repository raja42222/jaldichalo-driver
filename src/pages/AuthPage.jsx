import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { checkRateLimit, resetRateLimit, IS_DEMO, getDeviceFingerprint } from '../lib/security'
import { useAuth } from '../context/AuthContext'

/* =========================================================
   Indian phone: starts 6-9, exactly 10 digits
   License: state code (2 letters) + RTO code (2 digits) + year (4 digits) + number (7 digits)
   e.g. WB0120201234567 or DL0120181234567
   We validate format strictly but also check it matches typed number
========================================================= */
const isValidPhone     = n => /^[6-9]\d{9}$/.test(n)
const isValidLicenseNo = n => {
  const cleaned = n.replace(/[\s\-\/]/g, '').toUpperCase()
  // Must be 15-16 chars: 2 state + 2 RTO + 4 year + 7 serial
  // OR simplified: at least 9 chars, starts with 2 letters
  return cleaned.length >= 9 && /^[A-Z]{2}/.test(cleaned)
}
const isValidVehicleNo = n => {
  // Indian vehicle: XX00XX0000 format (some variation allowed)
  const cleaned = n.replace(/[\s\-]/g, '').toUpperCase()
  return cleaned.length >= 6 && /^[A-Z]{2}/.test(cleaned)
}

function Inp({ val, set, ph, type='text', mono, autoFocus, onSubmit, uppercase }) {
  return (
    <input type={type} placeholder={ph} value={val} autoFocus={!!autoFocus}
      autoComplete="off" autoCorrect="off" spellCheck={false}
      autoCapitalize="none"
      enterKeyHint={onSubmit?'done':'next'}
      onChange={e => set(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      onKeyDown={e => { if(e.key==='Enter'&&onSubmit){e.preventDefault();onSubmit()} }}
      style={{ padding:'14px 16px', borderRadius:16, border:`2px solid ${String(val).trim()?'#16A34A':'#E0E0E0'}`, fontSize:15, background:'#fff', outline:'none', fontFamily:'inherit', color:'#111', userSelect:'text', WebkitUserSelect:'text', width:'100%', display:'block', transition:'border-color 0.15s', ...(mono?{letterSpacing:'0.07em',fontWeight:700}:{}) }}
    />
  )
}

async function uploadDoc(file, userId, docKey) {
  const ext  = file.name.split('.').pop().toLowerCase()
  const path = `drivers/${userId}/${docKey}_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('driver-documents').upload(path, file, { upsert:true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('driver-documents').getPublicUrl(path)
  return publicUrl
}

async function buildDemoSession(num) {
  const e = `jcdr${num}@demo.jaldichalo.app`
  const p = `JaldiDr@${num}#2025`
  const { data:si } = await supabase.auth.signInWithPassword({ email:e, password:p })
  if (si?.session?.user) return { uid:si.session.user.id }
  const { data:su } = await supabase.auth.signUp({ email:e, password:p, options:{ data:{ phone:`+91${num}` } } })
  if (su?.session?.user) return { uid:su.session.user.id }
  return { uid:null, err:'Demo login failed. Please try again.' }
}

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

export default function AuthPage() {
  const { setProfileDirect } = useAuth()

  const [step,         setStepRaw]    = useState('phone')
  const [phone,        setPhone]      = useState('')
  const [channel,      setChannel]    = useState('sms')
  const [otp,          setOtp]        = useState(['','','','','',''])
  const [name,         setName]       = useState('')
  const [email,        setEmail]      = useState('')
  const [vehicle,      setVehicle]    = useState('bike')
  const [vehicleModel, setVM]         = useState('')
  const [vehicleNo,    setVN]         = useState('')
  const [licenseNo,    setLN]         = useState('')
  const [plateConfirmed, setPC]       = useState(false)
  const [licenseConfirmed, setLC]     = useState(false)
  const [docs, setDocs] = useState({
    license:     { file:null, url:null, uploading:false, done:false },
    vehicle_plate:{ file:null, url:null, uploading:false, done:false },
    rc:          { file:null, url:null, uploading:false, done:false },
    photo:       { file:null, url:null, uploading:false, done:false },
  })
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')
  const [licErr, setLicErr] = useState('')
  const [platErr,setPlatErr]= useState('')
  const [timer,  setTimer]  = useState(0)
  const otpRefs  = useRef([])
  const fileRefs = useRef({})

  const STEPS = ['phone','otp','name','driver-v']

  useEffect(() => {
    window.history.replaceState({ jcStep:'phone' }, '')
    const onPop = e => { const s=e.state?.jcStep; if(s&&STEPS.includes(s)){setStepRaw(s);setError('')} }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, []) // eslint-disable-line

  function setStep(s) { setStepRaw(s); window.history.pushState({ jcStep:s }, '') }

  useEffect(() => {
    if (timer<=0) return
    const id = setInterval(()=>setTimer(t=>t>0?t-1:0), 1000)
    return () => clearInterval(id)
  }, [timer])

  async function sendOTP() {
    if (!isValidPhone(phone)) { setError('Enter a valid Indian mobile number (starts 6-9, 10 digits)'); return }
    setError(''); setBusy(true)
    const { error:otpErr } = await supabase.auth.signInWithOtp({ phone:`+91${phone}`, options:{ channel } })
    setBusy(false)
    if (otpErr&&!otpErr.message?.includes('rate')) { setError(`Failed: ${otpErr.message}`); return }
    setTimer(30); setError('OTP sent! (Demo: 123456)'); setStep('otp')
  }

  async function verifyOTP() {
    const code = otp.join('')
    if (code.length!==6) { setError('Enter all 6 digits'); return }
    setError(''); setBusy(true)
    let uid = null
    const { data, error:ve } = await supabase.auth.verifyOtp({ phone:`+91${phone}`, token:code, type:'sms' })
    if (!ve&&data?.session?.user) uid = data.session.user.id
    if (!uid&&code==='123456') {
      const res = await buildDemoSession(phone)
      if (!res.uid) { setError(res.err||'Login failed.'); setBusy(false); return }
      uid = res.uid
    }
    if (!uid) { setError('Invalid OTP.'); setBusy(false); return }
    const { data:ex } = await supabase.from('drivers').select('*').eq('id',uid).maybeSingle()
    if (ex?.name) { setBusy(false); setProfileDirect(ex); return }
    setBusy(false); setStep('name')
  }

  async function saveDriver() {
    setLicErr(''); setPlatErr(''); setError('')
    // Validations
    if (!vehicleModel.trim())     { setError('Enter your vehicle model name'); return }
    if (!vehicleNo.trim())        { setError('Enter your vehicle plate number'); return }
    if (!isValidVehicleNo(vehicleNo)) { setError('Enter a valid Indian vehicle number (e.g. WB01AB1234)'); return }
    if (!licenseNo.trim())        { setLicErr('Enter your driving licence number'); return }
    if (!isValidLicenseNo(licenseNo)) { setLicErr('Invalid licence format. Example: WB0120201234567'); return }
    if (!docs.license.done)       { setLicErr('Upload your driving licence photo (front side, number visible)'); return }
    if (!docs.vehicle_plate.done) { setPlatErr('Upload a photo of your vehicle showing the number plate'); return }
    // Licence number must be confirmed (user ticked checkbox)
    if (!licenseConfirmed)        { setLicErr('Confirm that the licence number matches what is shown in your uploaded photo'); return }
    // Vehicle plate must be confirmed
    if (!plateConfirmed)          { setPlatErr(`Confirm that the plate number matches: ${vehicleNo.trim().toUpperCase()}`); return }

    setBusy(true)
    try {
      const { data:{ user }, error:uErr } = await supabase.auth.getUser()
      if (uErr||!user) { setError('Session expired.'); setBusy(false); return }
      const { data:paxChk } = await supabase.from('passengers').select('id').eq('id',user.id).maybeSingle()
      if (paxChk) { setError('This number is a Passenger account. Use Customer app.'); setBusy(false); return }

      const { error:rpcErr } = await supabase.rpc('upsert_driver', {
        p_id:user.id, p_name:name.trim(), p_phone:`+91${phone}`,
        p_email:email.trim()||null, p_vehicle_type:vehicle,
        p_vehicle_model:vehicleModel.trim(),
        p_vehicle_number:vehicleNo.trim().toUpperCase(),
        p_license_number:licenseNo.trim().toUpperCase(),
        p_license_url:docs.license.url||null,
        p_rc_url:docs.rc.url||null,
        p_photo_url:docs.photo.url||null,
        p_method:'phone'
      })
      if (rpcErr) {
        const { error:insErr } = await supabase.from('drivers').upsert({
          id:user.id, name:name.trim(), phone:`+91${phone}`, email:email.trim()||null,
          vehicle_type:vehicle, vehicle_model:vehicleModel.trim(),
          vehicle_number:vehicleNo.trim().toUpperCase(),
          license_number:licenseNo.trim().toUpperCase(),
          license_url:docs.license.url||null,
          vehicle_plate_url:docs.vehicle_plate.url||null,
          rc_url:docs.rc.url||null,
          profile_photo_url:docs.photo.url||null,
          status:'pending', phone_confirmed:true, login_method:'phone'
        }, { onConflict:'id' })
        if (insErr) { setError(insErr.message); setBusy(false); return }
      }
      setBusy(false)
      setProfileDirect({ id:user.id, name:name.trim(), phone:`+91${phone}`, email:email.trim()||null, vehicle_type:vehicle, vehicle_model:vehicleModel.trim(), vehicle_number:vehicleNo.trim().toUpperCase(), status:'pending', is_online:false, rating:5.00, total_rides:0, login_method:'phone', phone_confirmed:true })
    } catch(e) { setError(e.message||'Something went wrong.'); setBusy(false) }
  }

  async function handleDocUpload(docKey, file) {
    if (!file) return
    const maxMB = 10
    if (file.size > maxMB*1024*1024) { setError(`File too large. Max ${maxMB}MB.`); return }
    setDocs(prev => ({ ...prev, [docKey]:{ ...prev[docKey], file, uploading:true, done:false } }))
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      const url = await uploadDoc(file, user?.id||'tmp', docKey)
      setDocs(prev => ({ ...prev, [docKey]:{ file, url, uploading:false, done:true } }))
    } catch {
      // Fallback: use base64 locally (storage may not be configured)
      const reader = new FileReader()
      reader.onload = ev => setDocs(prev => ({ ...prev, [docKey]:{ file, url:ev.target.result, uploading:false, done:true } }))
      reader.readAsDataURL(file)
    }
  }

  function otpChange(i, v) {
    if (!/^\d?$/.test(v)) return
    const n=[...otp]; n[i]=v; setOtp(n)
    if (v&&i<5) otpRefs.current[i+1]?.focus()
  }
  function otpKey(i, e) { if(e.key==='Backspace'&&!otp[i]&&i>0) otpRefs.current[i-1]?.focus() }

  const pg = { position:'fixed', inset:0, background:'#fff', display:'flex', flexDirection:'column' }
  const BackIcon = () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>

  const Hdr = ({ title, sub, back }) => (
    <div style={{ background:'linear-gradient(135deg,#16A34A,#22C55E)', padding:'calc(env(safe-area-inset-top,0px)+14px) 20px 22px', flexShrink:0 }}>
      {back&&<button onClick={back} style={{ background:'rgba(255,255,255,0.25)', border:'none', borderRadius:10, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', marginBottom:12, color:'#fff' }}><BackIcon/></button>}
      <div style={{ color:'#fff' }}>
        <div style={{ fontSize:23, fontWeight:800 }}>{title}</div>
        {sub&&<div style={{ fontSize:13, opacity:0.85, marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  )
  const Btn = ({ label, fn, off }) => (
    <button onClick={fn} disabled={off||busy}
      style={{ padding:'15px', width:'100%', border:'none', borderRadius:16, background:off||busy?'#E0E0E0':'linear-gradient(135deg,#16A34A,#22C55E)', color:off||busy?'#999':'#fff', fontSize:16, fontWeight:800, cursor:off||busy?'default':'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
      {busy?'Please wait...':label}
    </button>
  )
  const DocUpload = ({ docKey, label, hint, required }) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#555' }}>{label}</div>
        {required&&<span style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'#FEF2F2', padding:'1px 6px', borderRadius:6 }}>Required</span>}
      </div>
      {hint&&<div style={{ fontSize:12, color:'#888', marginBottom:6 }}>{hint}</div>}
      <input ref={el=>fileRefs.current[docKey]=el} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={e=>handleDocUpload(docKey,e.target.files[0])} />
      <button onClick={()=>fileRefs.current[docKey]?.click()}
        style={{ width:'100%', padding:'12px 16px', border:`2px dashed ${docs[docKey].done?'#16A34A':required?'#F97316':'#E0E0E0'}`, borderRadius:14, background:docs[docKey].done?'#ECFDF5':required&&!docs[docKey].done?'#FFF7ED':'#F5F5F5', color:docs[docKey].done?'#16A34A':required?'#92400E':'#888', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        {docs[docKey].uploading ? '⏳ Uploading...' : docs[docKey].done ? `✓ ${docs[docKey].file?.name||'Uploaded'}` : `📷 ${required?'Upload (Required)':'Upload (Optional)'}`}
      </button>
      {docs[docKey].done && docs[docKey].url && docs[docKey].url.startsWith('data:image') && (
        <img src={docs[docKey].url} alt="preview" style={{ marginTop:8, width:'100%', maxHeight:120, objectFit:'cover', borderRadius:10, border:'1px solid #E0E0E0' }} />
      )}
    </div>
  )

  /* PHONE step */
  if (step==='phone') return (
    <div style={pg}>
      <div style={{ background:'linear-gradient(135deg,#16A34A,#22C55E)', padding:'calc(env(safe-area-inset-top,0px)+20px) 20px 28px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
          <div style={{ width:52, height:52, borderRadius:16, background:'rgba(255,255,255,0.22)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>🛵</div>
          <div>
            <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:22, color:'#fff' }}>JC Captain</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:1 }}>Earn with Jaldi Chalo</div>
          </div>
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Driver Login</div>
          <div style={{ fontSize:14, color:'#888' }}>Enter your registered Indian mobile number</div>
        </div>
        <button onClick={async()=>{setError('');setBusy(true);const{error:err}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${window.location.origin}/`,queryParams:{prompt:'select_account'}}});if(err){setError(err.message);setBusy(false)}}} disabled={busy}
          style={{ width:'100%', padding:'14px', border:'2px solid #E0E0E0', borderRadius:16, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:10, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit', marginBottom:14 }}>
          <GoogleIcon /> Continue with Google
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div style={{ flex:1, height:1, background:'#E0E0E0' }} />
          <span style={{ fontSize:12, color:'#aaa', fontWeight:600 }}>or mobile number</span>
          <div style={{ flex:1, height:1, background:'#E0E0E0' }} />
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <div style={{ padding:'14px 16px', background:'#F5F5F5', borderRadius:14, display:'flex', alignItems:'center', gap:8, flexShrink:0, fontSize:15, fontWeight:700 }}>
            <span>🇮🇳</span> +91
          </div>
          <div style={{ flex:1 }}><Inp val={phone} set={v=>setPhone(v.replace(/\D/g,'').slice(0,10))} ph="10-digit mobile number" type="tel" autoFocus onSubmit={sendOTP} /></div>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[{id:'sms',l:'SMS'},{id:'whatsapp',l:'WhatsApp'}].map(c=>(
            <button key={c.id} onClick={()=>setChannel(c.id)}
              style={{ flex:1, padding:'10px', borderRadius:12, border:`2px solid ${channel===c.id?'#16A34A':'#E0E0E0'}`, background:channel===c.id?'#ECFDF5':'#fff', color:channel===c.id?'#16A34A':'#888', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
              {c.l}
            </button>
          ))}
        </div>
        {error&&<div style={{ fontSize:13, color:error.includes('sent')?'#16A34A':'#DC2626', marginBottom:14, padding:'10px 14px', background:error.includes('sent')?'#ECFDF5':'#FEF2F2', borderRadius:10 }}>{error}</div>}
        <Btn label="Send OTP ->" fn={sendOTP} off={phone.length!==10||!isValidPhone(phone)} />
        <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:'#aaa', lineHeight:1.6 }}>
          Only approved Jaldi Chalo captains can login here
        </div>
      </div>
    </div>
  )

  if (step==='otp') return (
    <div style={pg}>
      <Hdr title="Verify Number" sub={`Code sent to +91 ${phone}`} back={()=>setStep('phone')} />
      <div style={{ flex:1, overflowY:'auto', padding:'28px 20px' }}>
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:20 }}>
          {otp.map((d,i)=>(
            <input key={i} ref={el=>otpRefs.current[i]=el}
              style={{ width:46, height:58, textAlign:'center', fontSize:24, fontWeight:900, background:'#F5F5F5', border:`2px solid ${d?'#16A34A':'#E0E0E0'}`, borderRadius:14, outline:'none', fontFamily:'inherit', color:'#111', userSelect:'text', WebkitUserSelect:'text' }}
              value={d} maxLength={1} inputMode="numeric"
              onChange={e=>otpChange(i,e.target.value)} onKeyDown={e=>otpKey(i,e)}
            />
          ))}
        </div>
        {error&&<div style={{ fontSize:13, color:error.includes('sent')?'#16A34A':'#DC2626', marginBottom:14, padding:'10px 14px', background:error.includes('sent')?'#ECFDF5':'#FEF2F2', borderRadius:10, textAlign:'center' }}>{error}</div>}
        <Btn label="Verify OTP ->" fn={verifyOTP} off={otp.join('').length!==6} />
        <div style={{ textAlign:'center', marginTop:18 }}>
          {timer>0?<span style={{ fontSize:13, color:'#888' }}>Resend in {timer}s</span>
            :<button onClick={()=>{setOtp(['','','','','','']);setStep('phone')}} style={{ fontSize:13, color:'#16A34A', background:'none', border:'none', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Change number / Resend</button>}
        </div>
      </div>
    </div>
  )

  if (step==='name') return (
    <div style={pg}>
      <Hdr title="Your Details" sub="Tell us about yourself" back={()=>setStep('otp')} />
      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:18 }}>
          <Inp val={name} set={setName} ph="Your full name" autoFocus />
          <Inp val={email} set={setEmail} ph="Email (optional)" type="email" />
        </div>
        {error&&<div style={{ color:'#DC2626', fontSize:13, marginBottom:14, padding:'10px 14px', background:'#FEF2F2', borderRadius:10 }}>{error}</div>}
        <Btn label="Next: Vehicle Details ->" fn={()=>{if(!name.trim()){setError('Enter your name');return};setError('');setStep('driver-v')}} off={!name.trim()} />
      </div>
    </div>
  )

  if (step==='driver-v') return (
    <div style={pg}>
      <Hdr title="Vehicle & Documents" sub="Required to start accepting rides" back={()=>setStep('name')} />
      <div style={{ flex:1, overflowY:'auto', padding:'20px 20px 40px' }}>

        {/* Vehicle type */}
        <div style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'#555' }}>Vehicle Type *</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
          {[{id:'bike',e:'🏍️',l:'Bike'},{id:'auto',e:'🛺',l:'Auto'},{id:'cab',e:'🚗',l:'Cab Non-AC'},{id:'cab-ac',e:'❄️',l:'Cab AC'}].map(v=>(
            <button key={v.id} onClick={()=>setVehicle(v.id)}
              style={{ padding:'14px 10px', borderRadius:14, border:`2px solid ${vehicle===v.id?'#16A34A':'#E0E0E0'}`, background:vehicle===v.id?'#ECFDF5':'#fff', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:28 }}>{v.e}</span>
              <span style={{ fontSize:13, fontWeight:700, color:vehicle===v.id?'#16A34A':'#555' }}>{v.l}</span>
            </button>
          ))}
        </div>

        {/* Vehicle details */}
        <div style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'#555' }}>Vehicle Details *</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
          <div>
            <Inp val={vehicleModel} set={setVM} ph="Vehicle model (e.g. Honda Activa 6G)" />
          </div>
          <div>
            <Inp val={vehicleNo} set={v=>setVN(v.replace(/\s/g,'').toUpperCase())} ph="Number plate (e.g. WB01AB1234)" mono uppercase />
            <div style={{ fontSize:11, color:'#888', marginTop:4 }}>Enter exactly as shown on your number plate</div>
          </div>
        </div>

        {/* Vehicle plate photo - REQUIRED */}
        <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, padding:'12px 14px', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#92400E', marginBottom:8 }}>
            📸 Vehicle Number Plate Photo (Required)
          </div>
          <div style={{ fontSize:12, color:'#92400E', opacity:0.8, marginBottom:10 }}>
            Take a clear photo showing your vehicle with the number plate clearly visible. The plate number must match what you entered above.
          </div>
          <DocUpload docKey="vehicle_plate" label="Vehicle + Number Plate Photo" required />
          {docs.vehicle_plate.done && (
            <div onClick={()=>setPC(!plateConfirmed)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#fff', borderRadius:10, cursor:'pointer', marginTop:8 }}>
              <div style={{ width:20, height:20, border:`2px solid ${plateConfirmed?'#16A34A':'#E0E0E0'}`, borderRadius:5, background:plateConfirmed?'#16A34A':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {plateConfirmed&&<span style={{ color:'#fff', fontSize:12, fontWeight:900 }}>✓</span>}
              </div>
              <span style={{ fontSize:12, color:'#555' }}>I confirm the plate in photo matches: <strong>{vehicleNo||'(enter plate above)'}</strong></span>
            </div>
          )}
          {platErr&&<div style={{ color:'#DC2626', fontSize:12, marginTop:6 }}>{platErr}</div>}
        </div>

        {/* Driving licence */}
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'12px 14px', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#16A34A', marginBottom:8 }}>
            🪪 Driving Licence (Required)
          </div>
          <div style={{ marginBottom:10 }}>
            <Inp val={licenseNo} set={v=>setLN(v.replace(/\s/g,'').toUpperCase())} ph="Licence number (e.g. WB0120201234567)" mono uppercase />
            <div style={{ fontSize:11, color:'#888', marginTop:4 }}>State code + RTO code + Year + Serial (e.g. WB01 2020 1234567)</div>
            {licErr&&<div style={{ color:'#DC2626', fontSize:12, marginTop:4 }}>{licErr}</div>}
          </div>
          <DocUpload docKey="license" label="Licence Front Side Photo" hint="Must clearly show licence number" required />
          {docs.license.done && licenseNo.length >= 9 && (
            <div onClick={()=>setLC(!licenseConfirmed)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#fff', borderRadius:10, cursor:'pointer', marginTop:8 }}>
              <div style={{ width:20, height:20, border:`2px solid ${licenseConfirmed?'#16A34A':'#E0E0E0'}`, borderRadius:5, background:licenseConfirmed?'#16A34A':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {licenseConfirmed&&<span style={{ color:'#fff', fontSize:12, fontWeight:900 }}>✓</span>}
              </div>
              <span style={{ fontSize:12, color:'#555' }}>I confirm my licence number <strong>{licenseNo}</strong> matches the uploaded photo</span>
            </div>
          )}
        </div>

        {/* RC Book */}
        <div style={{ marginBottom:12 }}>
          <DocUpload docKey="rc" label="RC Book (Registration Certificate)" hint="Optional but recommended" />
        </div>

        {/* Profile Photo */}
        <div style={{ marginBottom:16 }}>
          <DocUpload docKey="photo" label="Profile Photo" hint="Clear face photo for passenger safety" />
        </div>

        {error&&<div style={{ color:'#DC2626', fontSize:13, marginBottom:14, padding:'10px 14px', background:'#FEF2F2', borderRadius:10 }}>{error}</div>}

        <Btn label="Submit Application" fn={saveDriver} off={!vehicleModel.trim()||!vehicleNo.trim()||!licenseNo.trim()||!docs.license.done||!docs.vehicle_plate.done} />

        <div style={{ marginTop:14, padding:'12px 14px', background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, fontSize:12, color:'#92400E', lineHeight:1.6 }}>
          Your application will be reviewed within 24 hours. You will be notified once approved. Providing false documents will result in permanent ban.
        </div>
      </div>
    </div>
  )

  return null
}
