import { useState, useEffect, useRef } from 'react'
import { fmtRsSymbol as fmtRs } from '../lib/fareEngine'

/* ================================================================
   DRIVER DEMO MODE
   Shows a simulated ride request flow so driver can understand
   the app experience before going live.
   
   Flow:
   1. Heat map overlay (popular areas)
   2. Fake ride request appears with countdown
   3. Accept → OTP screen → Start ride → Complete
   4. Earnings added to demo wallet
================================================================ */

const KOLKATA_HOT_ZONES = [
  { name:'Howrah Station',    lat:22.5839, lng:88.3427, rides:142, color:'rgba(239,68,68,0.7)' },
  { name:'Sealdah Station',   lat:22.5644, lng:88.3700, rides:118, color:'rgba(239,68,68,0.65)' },
  { name:'Park Street',       lat:22.5510, lng:88.3515, rides:95,  color:'rgba(249,115,22,0.65)' },
  { name:'Salt Lake Sector V',lat:22.5706, lng:88.4342, rides:87,  color:'rgba(249,115,22,0.6)' },
  { name:'New Town',          lat:22.5976, lng:88.4801, rides:76,  color:'rgba(234,179,8,0.6)' },
  { name:'Esplanade',         lat:22.5641, lng:88.3516, rides:93,  color:'rgba(239,68,68,0.6)' },
  { name:'Gariahat',          lat:22.5184, lng:88.3714, rides:64,  color:'rgba(234,179,8,0.55)' },
  { name:'Dum Dum Airport',   lat:22.6547, lng:88.4467, rides:71,  color:'rgba(249,115,22,0.55)' },
]

const DEMO_RIDES = [
  { id:'dr1', pickup:'Howrah Station', drop:'Park Street', dist:5.2, fare:58, vehicle:'bike', pax:'Rahul S.' },
  { id:'dr2', pickup:'Sealdah',        drop:'Salt Lake',   dist:8.1, fare:92, vehicle:'bike', pax:'Priya M.' },
  { id:'dr3', pickup:'Esplanade',      drop:'Gariahat',    dist:6.4, fare:72, vehicle:'bike', pax:'Amit K.' },
  { id:'dr4', pickup:'New Town',       drop:'Airport',     dist:4.8, fare:54, vehicle:'bike', pax:'Suman B.' },
]

export default function DriverDemo({ onClose }) {
  const [phase,       setPhase]    = useState('heatmap') // heatmap | request | otp | riding | complete
  const [rideIdx,     setRideIdx]  = useState(0)
  const [countdown,   setCd]       = useState(15)
  const [otpEntered,  setOtp]      = useState('')
  const [earnings,    setEarnings] = useState(0)
  const [ridesCount,  setRidesCount] = useState(0)
  const cdRef = useRef(null)

  const ride = DEMO_RIDES[rideIdx % DEMO_RIDES.length]

  // Auto-start ride request after 3s on heatmap
  useEffect(() => {
    if (phase !== 'heatmap') return
    const t = setTimeout(() => { setPhase('request'); setCd(15) }, 3000)
    return () => clearTimeout(t)
  }, [phase])

  // Countdown for ride request
  useEffect(() => {
    if (phase !== 'request') return
    cdRef.current = setInterval(() => {
      setCd(p => {
        if (p <= 1) { clearInterval(cdRef.current); setPhase('heatmap'); setRideIdx(i => i+1); return 15 }
        return p - 1
      })
    }, 1000)
    return () => clearInterval(cdRef.current)
  }, [phase])

  function acceptRide() {
    clearInterval(cdRef.current)
    setPhase('otp')
    setOtp('')
  }

  function declineRide() {
    clearInterval(cdRef.current)
    setPhase('heatmap')
    setRideIdx(i => i+1)
  }

  function verifyOtp() {
    if (otpEntered === '1234') {
      setPhase('riding')
    }
  }

  function completeRide() {
    setEarnings(e => e + ride.fare)
    setRidesCount(r => r + 1)
    setPhase('complete')
  }

  function nextDemo() {
    setPhase('heatmap')
    setRideIdx(i => i+1)
  }

  const overlay = {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.85)',
    zIndex:200, display:'flex', flexDirection:'column',
    backdropFilter:'blur(4px)',
  }

  /* -- Heat Map ----------------------------------------------- */
  if (phase === 'heatmap') return (
    <div style={overlay}>
      <div style={{ background:'#1a1a2e', flex:1, display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ padding:'calc(env(safe-area-inset-top,0px)+14px) 16px 12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:18 }}>🔥 Hot Zones</div>
            <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>Where rides are happening now</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'50%', width:36, height:36, color:'#fff', cursor:'pointer', fontSize:18 }}>×</button>
        </div>

        {/* Demo notice */}
        <div style={{ margin:'0 16px 12px', background:'rgba(34,197,94,0.2)', border:'1px solid rgba(34,197,94,0.4)', borderRadius:12, padding:'8px 14px', display:'flex', gap:8, alignItems:'center' }}>
          <span>🎮</span>
          <span style={{ color:'#22C55E', fontSize:12, fontWeight:700 }}>DEMO MODE — A ride request is coming in 3 seconds...</span>
        </div>

        {/* Heat zones list */}
        <div style={{ flex:1, overflowY:'auto', padding:'0 16px' }}>
          {KOLKATA_HOT_ZONES.map((z, i) => (
            <div key={z.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'rgba(255,255,255,0.05)', borderRadius:14, marginBottom:8 }}>
              {/* Heat indicator */}
              <div style={{ width:44, height:44, borderRadius:12, background:z.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:16 }}>🔥</div>
                  <div style={{ fontSize:9, color:'#fff', fontWeight:800 }}>{z.rides}</div>
                </div>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ color:'#fff', fontWeight:700, fontSize:14 }}>{z.name}</div>
                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginTop:2 }}>{z.rides} rides today</div>
              </div>
              {/* Bar chart */}
              <div style={{ width:60, height:8, background:'rgba(255,255,255,0.1)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ width:`${(z.rides/142)*100}%`, height:'100%', background:z.color, borderRadius:4 }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding:'12px 16px calc(20px + env(safe-area-inset-bottom,0px))' }}>
          <button onClick={onClose}
            style={{ width:'100%', padding:'14px', borderRadius:16, border:'1.5px solid rgba(255,255,255,0.2)', background:'transparent', color:'rgba(255,255,255,0.8)', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>
            Close Demo
          </button>
        </div>
      </div>
    </div>
  )

  /* -- Ride Request ------------------------------------------- */
  if (phase === 'request') return (
    <div style={overlay}>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
        {/* Dim top */}
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'rgba(34,197,94,0.9)', borderRadius:20, padding:'10px 20px', display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:14 }}>🎮</span>
            <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>DEMO RIDE REQUEST</span>
          </div>
        </div>

        {/* Request card */}
        <div style={{ background:'#1C1C28', borderRadius:'24px 24px 0 0', padding:'20px 20px calc(32px + env(safe-area-inset-bottom,0px))' }}>
          {/* Countdown ring */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
            <div style={{ position:'relative', width:64, height:64 }}>
              <svg width="64" height="64" style={{ transform:'rotate(-90deg)' }}>
                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4"/>
                <circle cx="32" cy="32" r="28" fill="none" stroke={countdown<=5?'#EF4444':'#22C55E'} strokeWidth="4"
                  strokeDasharray={2*Math.PI*28}
                  strokeDashoffset={2*Math.PI*28*(1-countdown/15)}
                  style={{ transition:'stroke-dashoffset 1s linear' }} strokeLinecap="round"/>
              </svg>
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:18 }}>{countdown}</div>
            </div>
          </div>

          {/* Fare */}
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <div style={{ fontSize:32, fontWeight:900, color:'#fff' }}>{fmtRs(ride.fare)}</div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:13 }}>Cash · {ride.dist} km</div>
          </div>

          {/* Route */}
          <div style={{ background:'rgba(255,255,255,0.07)', borderRadius:16, padding:'14px 16px', marginBottom:16 }}>
            <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:10 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:'#22C55E', flexShrink:0 }} />
              <div>
                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:10, textTransform:'uppercase' }}>Pickup</div>
                <div style={{ color:'#fff', fontWeight:700 }}>{ride.pickup}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:'#FF5F1F', flexShrink:0 }} />
              <div>
                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:10, textTransform:'uppercase' }}>Drop</div>
                <div style={{ color:'#fff', fontWeight:700 }}>{ride.drop}</div>
              </div>
            </div>
          </div>

          {/* Passenger */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff' }}>
              {ride.pax.slice(0,2).toUpperCase()}
            </div>
            <div>
              <div style={{ color:'#fff', fontWeight:700 }}>{ride.pax}</div>
              <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12 }}>★★★★★ 4.9</div>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={declineRide}
              style={{ flex:1, padding:'15px', borderRadius:16, border:'1.5px solid rgba(255,255,255,0.2)', background:'transparent', color:'rgba(255,255,255,0.7)', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
              Decline
            </button>
            <button onClick={acceptRide}
              style={{ flex:2, padding:'15px', borderRadius:16, border:'none', background:'linear-gradient(135deg,#22C55E,#16A34A)', color:'#fff', fontWeight:900, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
              Accept Ride
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  /* -- OTP Verification --------------------------------------- */
  if (phase === 'otp') return (
    <div style={overlay}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
        <div style={{ background:'#1C1C28', borderRadius:'24px 24px 0 0', padding:'24px 20px calc(40px + env(safe-area-inset-bottom,0px))' }}>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6, textAlign:'center' }}>Arrived at Pickup</div>
          <div style={{ color:'#fff', fontWeight:800, fontSize:20, textAlign:'center', marginBottom:4 }}>Enter Passenger OTP</div>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:13, textAlign:'center', marginBottom:24 }}>Ask passenger for their 4-digit OTP</div>

          {/* Demo hint */}
          <div style={{ background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:12, padding:'10px 14px', marginBottom:20, textAlign:'center' }}>
            <span style={{ color:'#22C55E', fontSize:13, fontWeight:700 }}>Demo OTP: 1234</span>
          </div>

          {/* OTP input */}
          <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:20 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width:56, height:64, borderRadius:14, border:`2px solid ${otpEntered.length>i?'#22C55E':'rgba(255,255,255,0.2)'}`, background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:900, color:'#fff' }}>
                {otpEntered[i] || ''}
              </div>
            ))}
          </div>

          {/* Number pad */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map(n => (
              <button key={n} onClick={() => {
                if (!n) return
                if (n==='⌫') { setOtp(p => p.slice(0,-1)); return }
                if (otpEntered.length < 4) setOtp(p => p+n)
              }}
                style={{ padding:'16px', borderRadius:14, border:'none', background:n?'rgba(255,255,255,0.08)':'transparent', color:'#fff', fontWeight:700, fontSize:18, cursor:'pointer', fontFamily:'inherit' }}>
                {n}
              </button>
            ))}
          </div>

          <button onClick={verifyOtp} disabled={otpEntered.length!==4}
            style={{ width:'100%', padding:'15px', borderRadius:16, border:'none', background:otpEntered.length===4?'linear-gradient(135deg,#22C55E,#16A34A)':'rgba(255,255,255,0.1)', color:otpEntered.length===4?'#fff':'rgba(255,255,255,0.3)', fontWeight:800, fontSize:16, cursor:otpEntered.length===4?'pointer':'default', fontFamily:'inherit' }}>
            Verify & Start Ride
          </button>
        </div>
      </div>
    </div>
  )

  /* -- Riding ------------------------------------------------- */
  if (phase === 'riding') return (
    <div style={overlay}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
        {/* Top status */}
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:8 }}>🛵</div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:20 }}>Ride in Progress</div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:14, marginTop:4 }}>{ride.pickup} → {ride.drop}</div>
          </div>
        </div>

        <div style={{ background:'#1C1C28', borderRadius:'24px 24px 0 0', padding:'20px 20px calc(40px + env(safe-area-inset-bottom,0px))' }}>
          {/* Route info */}
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            {[{l:'Distance',v:`${ride.dist} km`},{l:'Fare',v:fmtRs(ride.fare)},{l:'Payment',v:'Cash'}].map(s=>(
              <div key={s.l} style={{ flex:1, background:'rgba(255,255,255,0.06)', borderRadius:12, padding:'10px', textAlign:'center' }}>
                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:10, textTransform:'uppercase', marginBottom:4 }}>{s.l}</div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>{s.v}</div>
              </div>
            ))}
          </div>
          <button onClick={completeRide}
            style={{ width:'100%', padding:'16px', borderRadius:16, border:'none', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', color:'#fff', fontWeight:900, fontSize:16, cursor:'pointer', fontFamily:'inherit' }}>
            Complete Ride →
          </button>
        </div>
      </div>
    </div>
  )

  /* -- Complete ----------------------------------------------- */
  if (phase === 'complete') return (
    <div style={overlay}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ fontSize:64, marginBottom:16 }}>🎉</div>
        <div style={{ color:'#fff', fontWeight:800, fontSize:26, marginBottom:8 }}>Ride Complete!</div>
        <div style={{ color:'rgba(255,255,255,0.6)', fontSize:15, marginBottom:24 }}>Great job, Captain!</div>

        {/* Earnings card */}
        <div style={{ background:'linear-gradient(135deg,#16A34A,#22C55E)', borderRadius:20, padding:'20px 28px', width:'100%', maxWidth:300, textAlign:'center', marginBottom:20 }}>
          <div style={{ color:'rgba(255,255,255,0.8)', fontSize:13, marginBottom:4 }}>You earned</div>
          <div style={{ color:'#fff', fontWeight:900, fontSize:42 }}>{fmtRs(ride.fare)}</div>
          <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12, marginTop:4 }}>Cash from passenger</div>
        </div>

        {/* Demo stats */}
        <div style={{ display:'flex', gap:16, marginBottom:28 }}>
          {[{l:'Demo Rides',v:ridesCount},{l:'Demo Earned',v:fmtRs(earnings)}].map(s=>(
            <div key={s.l} style={{ background:'rgba(255,255,255,0.08)', borderRadius:14, padding:'12px 20px', textAlign:'center' }}>
              <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11 }}>{s.l}</div>
              <div style={{ color:'#fff', fontWeight:800, fontSize:18, marginTop:2 }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:14, padding:'12px 16px', marginBottom:20, width:'100%', maxWidth:300, textAlign:'center' }}>
          <div style={{ color:'#22C55E', fontSize:13, fontWeight:700 }}>🎮 This was a demo ride</div>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12, marginTop:4 }}>Real rides will work exactly like this!</div>
        </div>

        <div style={{ display:'flex', gap:10, width:'100%', maxWidth:300 }}>
          <button onClick={nextDemo}
            style={{ flex:1, padding:'14px', borderRadius:16, border:'none', background:'linear-gradient(135deg,#22C55E,#16A34A)', color:'#fff', fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
            Another Demo
          </button>
          <button onClick={onClose}
            style={{ flex:1, padding:'14px', borderRadius:16, border:'1.5px solid rgba(255,255,255,0.2)', background:'transparent', color:'rgba(255,255,255,0.7)', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>
            Exit Demo
          </button>
        </div>
      </div>
    </div>
  )

  return null
}
