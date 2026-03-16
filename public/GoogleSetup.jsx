import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const isValidPhone = n => /^[6-9]\d{9}$/.test(n)

export default function GoogleSetup() {
  const { oauthUser, setProfileDirect, signOut } = useAuth()
  const [name,    setName]    = useState(oauthUser?.user_metadata?.full_name || '')
  const email = oauthUser?.email || ''
  const [phone,   setPhone]   = useState('')
  const [vehicle, setVehicle] = useState('bike')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function save() {
    if (!name.trim()) { setError('Enter your name'); return }
    if (!isValidPhone(phone)) { setError('Enter a valid 10-digit number'); return }
    setLoading(true)
    try {
      const { error:rpcErr } = await supabase.rpc('upsert_driver', {
        p_id:oauthUser.id, p_name:name.trim(), p_phone:`+91${phone}`,
        p_email:email||null, p_vehicle_type:vehicle,
        p_vehicle_model:'', p_vehicle_number:'', p_method:'google'
      })
      if (rpcErr) {
        const { error:insErr } = await supabase.from('drivers').upsert({
          id:oauthUser.id, name:name.trim(), phone:`+91${phone}`, email:email||null,
          vehicle_type:vehicle, status:'pending', phone_confirmed:true, login_method:'google'
        }, { onConflict:'id' })
        if (insErr) { setError(insErr.message); setLoading(false); return }
      }
      setLoading(false)
      setProfileDirect({ id:oauthUser.id, name:name.trim(), phone:`+91${phone}`, email:email||null, vehicle_type:vehicle, status:'pending', is_online:false, rating:5.00, total_rides:0, login_method:'google' })
    } catch(e) { setError(e.message||'Something went wrong.'); setLoading(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', flexDirection:'column' }}>
      <div style={{ background:'linear-gradient(135deg,#16A34A,#22C55E)', padding:'calc(env(safe-area-inset-top,0px)+16px) 20px 24px', flexShrink:0, color:'#fff' }}>
        <div style={{ fontWeight:800, fontSize:20, marginBottom:4 }}>Complete Driver Profile</div>
        <div style={{ fontSize:13, opacity:0.9 }}>{email}</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
          {[{label:'Full Name',val:name,set:setName,ph:'Your name'},{label:'Mobile Number',val:phone,set:v=>setPhone(v.replace(/\D/g,'')),ph:'10-digit number',type:'tel'}].map(f=>(
            <div key={f.label}>
              <div style={{ fontSize:13, fontWeight:700, color:'#555', marginBottom:6 }}>{f.label}</div>
              <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} type={f.type||'text'}
                style={{ padding:'14px 16px', borderRadius:14, border:`2px solid ${f.val.trim()?'#16A34A':'#E0E0E0'}`, fontSize:15, background:'#fff', outline:'none', fontFamily:'inherit', color:'#111', userSelect:'text', WebkitUserSelect:'text', width:'100%' }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#555', marginBottom:8 }}>Vehicle Type</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[{id:'bike',e:'🏍️',l:'Bike'},{id:'auto',e:'🛺',l:'Auto'},{id:'cab',e:'🚗',l:'Cab Non-AC'},{id:'cab-ac',e:'❄️',l:'Cab AC'}].map(v=>(
                <button key={v.id} onClick={()=>setVehicle(v.id)}
                  style={{ padding:'12px', borderRadius:12, border:`2px solid ${vehicle===v.id?'#16A34A':'#E0E0E0'}`, background:vehicle===v.id?'#ECFDF5':'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:24 }}>{v.e}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:vehicle===v.id?'#16A34A':'#555' }}>{v.l}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {error&&<div style={{ color:'#DC2626', fontSize:13, marginBottom:14, padding:'10px 14px', background:'#FEF2F2', borderRadius:10 }}>{error}</div>}
        <button onClick={save} disabled={loading||!name.trim()||phone.length!==10}
          style={{ width:'100%', padding:'15px', borderRadius:16, background:loading||!name.trim()||phone.length!==10?'#E0E0E0':'linear-gradient(135deg,#16A34A,#22C55E)', color:loading||!name.trim()||phone.length!==10?'#999':'#fff', fontWeight:800, fontSize:16, border:'none', cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
          {loading?'Saving...':'Submit Application ->'}
        </button>
        <button onClick={signOut} style={{ width:'100%', padding:'12px', borderRadius:14, border:'1.5px solid #E0E0E0', background:'transparent', color:'#888', fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
        <div style={{ marginTop:12, padding:'12px', background:'#ECFDF5', borderRadius:12, fontSize:12, color:'#16A34A', lineHeight:1.6 }}>
          Your application will be reviewed within 24 hours. You will be notified once approved.
        </div>
      </div>
    </div>
  )
}
