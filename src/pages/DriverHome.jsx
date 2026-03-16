import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { isDriverNearPickup, isValidRideTransition, checkRateLimit } from '../lib/security'
import { useAuth } from '../context/AuthContext'
import { updateDriverLocation, RIDE_STATUS } from '../lib/etaService'
import { fmtRsSymbol as fmtRs } from '../lib/fareEngine'
import { getDistanceKm, getEtaMins } from '../lib/geo'
import MapView from '../components/MapView'
import { DriverFareCard } from '../components/ETAPanel'
import { SafetyBar, SafetyAlertToast, useSafetyAlerts, ReportModal, EmergencyContactsScreen } from '../components/SafetyPanel'
import { SkeletonProfile, SkeletonEarnings, SkeletonWallet, SkeletonMap } from '../components/Skeleton'
import CancelRideModal from '../components/CancelRideModal'
import DriverDemo from '../components/DriverDemo'

const MIN_BAL     = 50
const COUNTDOWN_S = 15

/* == Icons == */
const PhoneIcon = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.71a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
const ChatIcon  = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const SendIcon  = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
const WaIcon    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
const OutIcon   = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
const ChevR     = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
const NavIcon   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>

function Toast({ msg }) {
  if (!msg) return null
  return (
    <div className="anim-bounce" style={{ position:'fixed', top:72, left:16, right:16, zIndex:999, background:'rgba(17,17,17,0.93)', backdropFilter:'blur(10px)', color:'#fff', borderRadius:16, padding:'14px 18px', fontWeight:700, fontSize:14, textAlign:'center', boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }}>
      {msg}
    </div>
  )
}

function CountdownRing({ seconds, total }) {
  const pct   = seconds / total
  const r     = 22
  const circ  = 2 * Math.PI * r
  const color = seconds <= 5 ? '#EF4444' : seconds <= 10 ? '#F59E0B' : '#22C55E'
  return (
    <svg width="56" height="56" style={{ transform:'rotate(-90deg)' }}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4"/>
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        style={{ transition:'stroke-dashoffset 1s linear, stroke 0.3s' }}
      />
      <text x="28" y="32" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800"
        style={{ transform:'rotate(90deg) translate(0,-56px)' }}>
        {seconds}
      </text>
    </svg>
  )
}

function useRideTimer(active) {
  const [secs, setSecs] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    if (!active) { setSecs(0); clearInterval(ref.current); return }
    ref.current = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(ref.current)
  }, [active])
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function pushScreen(name) { window.history.pushState({ jcScreen: name }, '') }
function replaceScreen(name) { window.history.replaceState({ jcScreen: name }, '') }

export default function DriverHome() {
  const { profile, signOut, refreshProfile, setProfileDirect } = useAuth()

  const [tab,       setTab]     = useState('drive')
  const [online,    setOnline]  = useState(false)
  const [wallet,    setWallet]  = useState(null)
  const [active,    setActive]  = useState(null)
  const [pax,       setPax]     = useState(null)
  const [income,    setIncome]  = useState(null)
  const [rideState, setRS]      = useState('idle')
  const [gps,       setGps]     = useState(null)
  const [history,   setHist]    = useState([])
  const [countdown, setCd]      = useState(COUNTDOWN_S)
  const [pickupEta, setPickupEta] = useState(null)
  const [chatOpen,  setChat]    = useState(false)
  const [msgs,      setMsgs]    = useState([])
  const [chatIn,    setChatIn]  = useState('')
  const [otpEntry,  setOtpE]    = useState(['','','',''])
  const [otpError,  setOtpErr]  = useState('')
  const [otpLoad,   setOtpLoad] = useState(false)
  const [toast,     setToast]   = useState('')
  const [showRec,   setShowRec] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelStats, setCancelStats] = useState(null)
  const [mapReady,    setMapReady]   = useState(false)
  const [showDemo,    setShowDemo]   = useState(false)
  const [rechAmt,   setRA]      = useState(200)
  const [safetyAlert, setSA]    = useState(null)
  const [showReport,  setSR]    = useState(false)
  const [showEC,    setShowEC]  = useState(false)

  const watchId    = useRef(null)
  const locTimer   = useRef(null)
  const cdRef      = useRef(null)
  const chatEndRef = useRef(null)
  const otpRefs    = useRef([])
  const rideTimer  = useRideTimer(rideState === 'riding')

  const showToast = m => { setToast(m); setTimeout(() => setToast(''), 3200) }

  /* === Back button management === */
  useEffect(() => {
    replaceScreen('drive')
    function onPop(e) {
      const scr = e.state?.jcScreen
      if (!scr || scr === 'drive') {
        if (showEC)   { setShowEC(false);   return }
        if (chatOpen) { setChat(false);     return }
        if (tab !== 'drive') { setTab('drive'); return }
        // On main drive tab — stay in app
        window.history.pushState({ jcScreen:'drive' }, '')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [chatOpen, showEC, tab]) // eslint-disable-line

  useEffect(() => { if (chatOpen) pushScreen('chat')           }, [chatOpen])
  useEffect(() => { if (showEC)   pushScreen('emergencyContacts') }, [showEC])
  useEffect(() => { if (tab !== 'drive') pushScreen(tab) }, [tab])

  useEffect(() => {
    if (profile) {
      loadWallet(); loadHist()
      supabase.rpc('get_driver_cancel_stats', { p_driver_id: profile.id })
        .then(({ data }) => { if (data) setCancelStats(data) })
        .catch(() => {})
    }
  }, [profile]) // eslint-disable-line

  /* === Realtime: Driver profile updates (approval, rating) === */
  useEffect(() => {
    if (!profile?.id) return
    // Subscribe to own driver row changes
    const ch = supabase.channel(`dr-profile-${profile.id}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'drivers',
        filter: `id=eq.${profile.id}`,
      }, ({ new: updated }) => {
        // Update profile in AuthContext cache directly
        setProfileDirect({ ...profile, ...updated })
        // Show toast for status changes
        if (updated.status?.toLowerCase() === 'approved' && profile?.status?.toLowerCase() !== 'approved') {
          showToast('🎉 Your application has been approved! You can now go online.')
        }
        if (updated.status?.toLowerCase() === 'rejected' && profile?.status !== 'rejected') {
          showToast('❌ Your application was rejected. Please contact support.')
        }
      })
      .subscribe()

    // Also poll every 30s when pending (for clients where realtime might not work)
    let pollTimer = null
    if (profile?.status === 'pending') {
      pollTimer = setInterval(async () => {
        const { data } = await supabase.from('drivers')
          .select('status, rating, is_online').eq('id', profile.id).single()
        if (data && data.status !== profile.status) {
          setProfileDirect({ ...profile, ...data })
          if (data.status === 'approved') {
            showToast('🎉 Application approved! You can now go online.')
          }
        }
      }, 30000)
    }

    return () => {
      supabase.removeChannel(ch)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [profile?.id, profile?.status]) // eslint-disable-line // eslint-disable-line
  useEffect(() => { if (online) startGPS(); else stopGPS(); return stopGPS }, [online]) // eslint-disable-line

  useEffect(() => {
    window.history.replaceState({ jcDTab:'drive' }, '')
    const onPop = e => setTab(e.state?.jcDTab || 'drive')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  async function loadWallet() {
    const { data } = await supabase.from('driver_wallets').select('*').eq('driver_id', profile.id).single()
    setWallet(data)
  }
  async function loadHist() {
    const { data } = await supabase.from('rides').select('*').eq('driver_id', profile.id).order('created_at', { ascending:false }).limit(30)
    setHist(data || [])
  }

  const GPS_KEY = 'jc_driver_pos'
  function saveDriverGPS(lat, lng) { try { localStorage.setItem(GPS_KEY, JSON.stringify({ lat, lng, ts: Date.now() })) } catch {} }

  function startGPS() {
    if (!navigator.geolocation) return
    // Try to get immediate position first
    navigator.geolocation.getCurrentPosition(
      pos => { const { latitude:lat, longitude:lng } = pos.coords; saveDriverGPS(lat,lng); setGps([lat,lng]) },
      () => { try { const c=JSON.parse(localStorage.getItem(GPS_KEY||'{}')); if(c?.lat) setGps([c.lat,c.lng]) } catch {} },
      { enableHighAccuracy:true, timeout:15000, maximumAge:5000 }
    )
    watchId.current = navigator.geolocation.watchPosition(
      pos => { const { latitude:lat, longitude:lng } = pos.coords; saveDriverGPS(lat,lng); setGps([lat, lng]) },
      () => {},
      { enableHighAccuracy:true, maximumAge:2000, timeout:10000 }
    )
    locTimer.current = setInterval(async () => {
      if (!profile) return
      navigator.geolocation.getCurrentPosition(
        async pos => {
          const { latitude:lat, longitude:lng } = pos.coords
          setGps([lat, lng])
          await updateDriverLocation(profile.id, lat, lng)
          if (active) {
            await supabase.from('driver_locations').insert({
              driver_id:profile.id, ride_id:active.id, lat, lng,
              recorded_at: new Date().toISOString()
            })
          }
        },
        () => {},
        { enableHighAccuracy:true, maximumAge:0, timeout:4000 }
      )
    }, 2000)
  }
  function stopGPS() {
    if (watchId.current)  { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
    if (locTimer.current) { clearInterval(locTimer.current); locTimer.current = null }
  }

  /* Pickup ETA when approaching */
  useEffect(() => {
    if (!gps || !active || rideState !== 'active') { setPickupEta(null); return }
    const distKm = getDistanceKm(gps[0], gps[1], active.pickup_lat, active.pickup_lng)
    setPickupEta({ distKm: distKm.toFixed(1), mins: getEtaMins(distKm, 18) })
  }, [gps, active, rideState]) // eslint-disable-line

  /* Realtime: incoming rides */
  useEffect(() => {
    if (!profile || !online) return
    const ch = supabase.channel(`dr-rides-${profile.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rides', filter:`driver_id=eq.${profile.id}` }, ({ new:r }) => {
        if (r.ride_status === 'requested' && rideState === 'idle') {
          setIncome(r); setRS('incoming'); startCountdown()
        }
        if (r.ride_status === RIDE_STATUS.CANCELLED || r.ride_status === 'cancelled') {
          setIncome(null); setActive(null); setPax(null); setRS('idle')
          showToast('Ride cancelled by passenger'); stopCountdown()
        }
      }).subscribe()
    return () => ch.unsubscribe()
  }, [profile?.id, online, rideState]) // eslint-disable-line

  useSafetyAlerts(active?.id, a => setSA(a))

  /* Chat subscription */
  useEffect(() => {
    if (!active) return
    const ch = supabase.channel(`drchat-${active.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages', filter:`ride_id=eq.${active.id}` }, ({ new:m }) => {
        setMsgs(prev => prev.find(x => x.id === m.id) ? prev : [...prev, m])
        chatEndRef.current?.scrollIntoView({ behavior:'smooth' })
      }).subscribe()
    return () => ch.unsubscribe()
  }, [active?.id])

  function startCountdown() {
    stopCountdown(); setCd(COUNTDOWN_S)
    cdRef.current = setInterval(() => {
      setCd(prev => {
        if (prev <= 1) { stopCountdown(); declineRide(); return 0 }
        return prev - 1
      })
    }, 1000)
  }
  function stopCountdown() {
    if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null }
  }

  async function toggleOnline() {
    const next = !online
    // Block pending/rejected drivers
    if (next && profile?.status?.toLowerCase() !== 'approved') {
      showToast('Your application is under review. You can go online once approved.')
      return
    }
    if (next && wallet && wallet.balance < MIN_BAL) {
      showToast('Wallet too low. Min Rs.' + MIN_BAL + ' required to go online.')
      setShowRec(true); return
    }
    await supabase.from('drivers').update({ is_online:next }).eq('id', profile.id)
    setOnline(next)
    showToast(next ? 'You are ONLINE! Waiting for rides...' : 'You went offline.')
  }

  async function acceptRide() {
    if (!income) return
    stopCountdown()
    await supabase.from('rides').update({ ride_status: RIDE_STATUS.ASSIGNED, driver_id:profile.id, accepted_at:new Date().toISOString() }).eq('id', income.id)
    const { data: ps } = await supabase.from('passengers').select('*').eq('id', income.passenger_id).single()
    setPax(ps); setActive(income); setIncome(null)
    setRS('active'); setMsgs([]); setOtpE(['','','',''])
    // Update acceptance rate stat
    await supabase.rpc('update_driver_acceptance', { p_driver_id:profile.id, p_accepted:true }).catch(()=>{})
    showToast('Ride accepted! Navigate to pickup.')
  }
  async function declineRide() {
    stopCountdown()
    if (income?.id) {
      // Reset ride back to searching so dispatch can try next driver
      await supabase.from('rides').update({ driver_id:null, ride_status: RIDE_STATUS.SEARCHING })
        .eq('id', income.id).eq('driver_id', profile.id)
      // Update acceptance rate
      await supabase.rpc('update_driver_acceptance', { p_driver_id:profile.id, p_accepted:false }).catch(()=>{})
    }
    setIncome(null); setRS('idle')
  }

  function openDriverCancelModal() {
    if (!active) return
    setShowCancelModal(true)
  }

  function onDriverCancelled(result) {
    setShowCancelModal(false)
    setActive(null); setPax(null); setMsgs([]); setOtpE(['','','','']); setRS('idle')
    stopCountdown()
    if (result?.rating_reduced) {
      showToast('Warning: Your rating was reduced due to too many cancellations today.')
    } else if (result?.daily_cancellations > 2) {
      showToast(`Warning: ${result.daily_cancellations} cancellations today. Limit is 3.`)
    } else {
      showToast('Ride cancelled.')
    }
    // Refresh cancel stats
    supabase.rpc('get_driver_cancel_stats', { p_driver_id: profile.id })
      .then(({ data }) => { if (data) setCancelStats(data) }).catch(() => {})
  }

  async function arrivedAtPickup() {
    if (!active) return
    await supabase.from('rides').update({ ride_status: RIDE_STATUS.ARRIVED }).eq('id', active.id)
    showToast('Passenger notified you have arrived!')
  }

  function handleOtpInput(i, v) {
    if (!/^\d?$/.test(v)) return
    const n = [...otpEntry]; n[i] = v; setOtpE(n)
    if (v && i < 3) otpRefs.current[i+1]?.focus()
  }
  function otpKey(i, e) { if (e.key === 'Backspace' && !otpEntry[i] && i > 0) otpRefs.current[i-1]?.focus() }

  async function verifyOTP() {
    const code = otpEntry.join('')
    if (code.length !== 4) { setOtpErr('Enter 4-digit OTP'); return }

    // Rate limit: max 5 attempts per ride
    const rl = checkRateLimit(`ride_otp_${active?.id}`, 5, 30 * 60 * 1000)
    if (!rl.allowed) {
      setOtpErr('Too many wrong attempts. This ride will be cancelled.')
      await supabase.from('rides').update({ ride_status: RIDE_STATUS.CANCELLED, cancelled_by:'system', cancelled_at:new Date().toISOString() }).eq('id', active.id)
      setRS('idle'); setActive(null); setPax(null)
      return
    }

    // GPS proximity check: driver must be within 500m of pickup
    if (gps && active?.pickup_lat) {
      const { isNear, distanceM } = isDriverNearPickup(gps[0], gps[1], active.pickup_lat, active.pickup_lng, 500)
      if (!isNear) {
        setOtpErr(`You are ${distanceM}m away. Move closer to pickup point (within 500m) to start ride.`)
        return
      }
    }

    // State machine check
    if (!isValidRideTransition(active.ride_status, 'started')) {
      setOtpErr('Invalid ride state. Please refresh.')
      return
    }

    setOtpLoad(true); setOtpErr('')
    const { data } = await supabase.rpc('verify_ride_otp', { ride_uuid:active.id, entered:code })
    setOtpLoad(false)
    if (data) {
      setRS('riding')
      await supabase.from('rides').update({ ride_status: RIDE_STATUS.STARTED, started_at:new Date().toISOString() }).eq('id', active.id)
      showToast('OTP verified! Ride started.')
    } else {
      const remaining = rl.remaining - 1
      setOtpErr(`Wrong OTP. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Last attempt!'}`)
    }
  }

  async function endRide() {
    if (!active) return
    // State machine: can only complete from 'started'
    const currentDbStatus = rideState === 'riding' ? 'started' : (active.ride_status || 'started')
    if (!isValidRideTransition(currentDbStatus, 'completed')) {
      showToast('Cannot end ride in current state.')
      return
    }
    await supabase.from('rides').update({ ride_status: RIDE_STATUS.COMPLETED, completed_at:new Date().toISOString() }).eq('id', active.id)
    try {
      const commission   = +(active.platform_commission || 0)
      const driverEarns  = +(active.driver_earnings || 0)
      const curOut       = +(wallet?.outstanding_commission || 0)
      const curTotal     = +(wallet?.total_earnings || 0)
      const curBal       = +(wallet?.balance || 0)

      if (active.payment_method === 'cash') {
        // Cash: driver collects full fare, owes commission to platform
        await supabase.from('driver_wallets').upsert({
          driver_id:              profile.id,
          outstanding_commission: +(curOut + commission).toFixed(2),
          total_earnings:         +(curTotal + driverEarns).toFixed(2),
          balance:                Math.max(0, +(curBal - 0).toFixed(2)), // cash: no instant deduct
          updated_at:             new Date().toISOString(),
        }, { onConflict:'driver_id' })
      } else {
        // UPI: platform collects, driver gets credited
        await supabase.from('driver_wallets').upsert({
          driver_id:      profile.id,
          total_earnings: +(curTotal + driverEarns).toFixed(2),
          balance:        +(curBal + driverEarns).toFixed(2),
          updated_at:     new Date().toISOString(),
        }, { onConflict:'driver_id' })
      }
      // Log transaction
      await supabase.from('wallet_transactions').insert({
        driver_id:     profile.id,
        type:          active.payment_method === 'cash' ? 'commission_deduct' : 'bonus',
        amount:        driverEarns,
        balance_after: active.payment_method === 'cash' ? curBal : +(curBal + driverEarns).toFixed(2),
        notes:         `Ride ${active.id?.slice(0,8)} - ${active.payment_method}`
      })
    } catch (e) { console.error('Wallet update failed:', e) }
    await loadWallet(); await loadHist()
    setRS('done')
    setTimeout(() => {
      setActive(null); setPax(null); setMsgs([]); setOtpE(['','','','']); setRS('idle')
    }, 3000)
    showToast('Ride complete! Great work.')
  }

  async function sendChat() {
    if (!chatIn.trim() || !active) return
    const msg = chatIn.trim(); setChatIn('')
    await supabase.from('chat_messages').insert({ ride_id:active.id, sender_id:profile.id, sender_role:'driver', message:msg })
    setMsgs(prev => [...prev, { id:Date.now(), sender_role:'driver', message:msg }])
    chatEndRef.current?.scrollIntoView({ behavior:'smooth' })
  }

  async function recharge() {
    if (!rechAmt || rechAmt < 50) return
    const outstanding = wallet?.outstanding_commission || 0
    const rawBal      = (wallet?.balance || 0) + rechAmt
    const newBal      = Math.max(0, rawBal - outstanding)
    await supabase.from('driver_wallets').update({
      balance:+(newBal).toFixed(2), outstanding_commission:0, updated_at:new Date().toISOString()
    }).eq('driver_id', profile.id)
    await supabase.from('wallet_transactions').insert({
      driver_id:profile.id, type:'recharge', amount:rechAmt, balance_after:newBal, notes:'UPI Recharge'
    })
    await loadWallet(); setShowRec(false)
    showToast('Rs.' + rechAmt + ' added! Outstanding cleared.')
  }

  const lowBal       = wallet && wallet.balance < MIN_BAL
  const isActive     = ['active','riding'].includes(rideState)
  const initials     = profile?.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'D'
  const todayEarnings = history
    .filter(r => r.ride_status === 'completed' && new Date(r.created_at).toDateString() === new Date().toDateString())
    .reduce((s, r) => s + (r.driver_earnings || 0), 0)
  const todayRides = history.filter(r =>
    r.ride_status === 'completed' && new Date(r.created_at).toDateString() === new Date().toDateString()
  ).length

  /* Chat screen */
  if (chatOpen && active) return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#fff' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button className="btn btn-icon" onClick={() => setChat(false)}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex:1 }}>
          <div className="t-h3">{pax?.name || 'Passenger'}</div>
          <div className="t-tiny t-muted">Passenger · In-app chat</div>
        </div>
        <button onClick={() => setChat(true)} className="btn btn-icon" style={{ background:'#ECFDF5', color:'var(--green)' }}><ChatIcon /></button>
      </div>
      <div className="scroll" style={{ flex:1, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
        {msgs.length === 0 && <div style={{ textAlign:'center', padding:'48px 0' }}><div style={{ fontSize:36, marginBottom:10 }}>💬</div><div className="t-body t-muted">Send a message</div></div>}
        {msgs.map((m, i) => (
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:m.sender_role==='driver'?'flex-end':'flex-start' }}>
            <div className={m.sender_role==='driver' ? 'bubble-me' : 'bubble-them'}>{m.message}</div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
        <input className="input" style={{ flex:1 }} placeholder="Message..." value={chatIn}
          onChange={e => setChatIn(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} />
        <button className="btn btn-primary" style={{ width:46, padding:0, borderRadius:14, flexShrink:0 }} onClick={sendChat}><SendIcon /></button>
      </div>
    </div>
  )

  if (showEC) return <EmergencyContactsScreen userId={profile.id} role="driver" onClose={() => setShowEC(false)} />

  return (
    <div style={{ height:'100dvh', overflow:'hidden', position:'relative', background:'#e9e5de' }}>
      <Toast msg={toast} />
      {safetyAlert && <SafetyAlertToast alert={safetyAlert} onDismiss={() => setSA(null)} />}
      {showReport && active && <ReportModal rideId={active.id} userId={profile.id} role="driver" onClose={() => setSR(false)} />}
      {showCancelModal && active && (
        <CancelRideModal
          ride={active} role="driver" userId={profile.id}
          onCancelled={onDriverCancelled}
          onClose={() => setShowCancelModal(false)}
        />
      )}

      {/* Incoming ride popup */}
      {rideState === 'incoming' && income && (
        <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end' }}>
          <div className="anim-slide" style={{ width:'100%', background:'#111', color:'#fff', borderRadius:'26px 26px 0 0', paddingBottom:`calc(20px + var(--safe-bottom))`, overflow:'hidden' }}>
            <div style={{ height:4, background:'linear-gradient(90deg,#22C55E,#16A34A)' }} />
            <div style={{ padding:'16px 20px 0' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#22C55E', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>New Ride Request</div>
                  <div style={{ fontSize:22, fontWeight:900, color:'#fff' }}>
                    {fmtRs(income.driver_earnings || (income.fare || 0) * 0.9)}
                    <span style={{ fontSize:14, fontWeight:600, color:'rgba(255,255,255,0.5)', marginLeft:6 }}>
                      {income.payment_method === 'cash' ? 'Cash' : 'UPI'}
                    </span>
                  </div>
                </div>
                <CountdownRing seconds={countdown} total={COUNTDOWN_S} />
              </div>

              <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:16, padding:14, marginBottom:14 }}>
                <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:10 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:'#22C55E', marginTop:4, flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.45)', textTransform:'uppercase', letterSpacing:'0.06em' }}>PICKUP</div>
                    <div style={{ fontSize:15, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{income.pickup_address}</div>
                  </div>
                </div>
                <div style={{ marginLeft:4, width:2, height:14, background:'rgba(255,255,255,0.2)', marginBottom:10 }} />
                <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:'#F97316', marginTop:4, flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.45)', textTransform:'uppercase', letterSpacing:'0.06em' }}>DROP</div>
                    <div style={{ fontSize:15, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{income.drop_address}</div>
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:8, marginBottom:18 }}>
                {[
                  { v:`${parseFloat(income.distance_km || 0).toFixed(1)} km`, l:'Ride dist' },
                  { v:`${income.duration_min || '?'} min`, l:'Duration' },
                  { v:gps ? `${getDistanceKm(gps[0], gps[1], income.pickup_lat, income.pickup_lng).toFixed(1)} km` : '--', l:'To pickup' },
                ].map(s => (
                  <div key={s.l} style={{ flex:1, background:'rgba(255,255,255,0.08)', borderRadius:12, padding:'10px 6px', textAlign:'center' }}>
                    <div style={{ fontSize:16, fontWeight:900, color:'#fff' }}>{s.v}</div>
                    <div style={{ fontSize:10, fontWeight:600, color:'rgba(255,255,255,0.45)', textTransform:'uppercase', letterSpacing:'0.04em' }}>{s.l}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={declineRide}
                  style={{ flex:1, padding:'15px', borderRadius:16, border:'1.5px solid rgba(255,255,255,0.2)', background:'transparent', color:'rgba(255,255,255,0.7)', fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
                  Decline
                </button>
                <button onClick={acceptRide}
                  style={{ flex:2.5, padding:'15px', borderRadius:16, background:'linear-gradient(135deg,#22C55E,#16A34A)', color:'#fff', fontWeight:900, fontSize:17, border:'none', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 6px 24px rgba(34,197,94,0.4)' }}>
                  Accept {countdown}s
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recharge modal */}
      {showRec && (
        <div style={{ position:'fixed', inset:0, zIndex:180, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end' }}>
          <div className="anim-slide" style={{ width:'100%', background:'#fff', borderRadius:'24px 24px 0 0', padding:`16px 20px calc(28px + var(--safe-bottom))` }}>
            <div className="sheet-handle" />
            <div className="t-h1" style={{ marginBottom:4 }}>Recharge Wallet</div>
            <div className="t-body t-muted" style={{ marginBottom:16 }}>Min Rs.{MIN_BAL} required to go online</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:14 }}>
              {[100,200,500,1000].map(a => (
                <button key={a} onClick={() => setRA(a)}
                  style={{ padding:'12px 20px', borderRadius:14, border:`2px solid ${rechAmt===a?'var(--green)':'var(--border)'}`, background:rechAmt===a?'var(--green-dim)':'#fff', color:rechAmt===a?'var(--green)':'var(--text2)', fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
                  Rs.{a}
                </button>
              ))}
            </div>
            <input className="input" type="number" style={{ marginBottom:14 }} placeholder="Custom amount" value={rechAmt} onChange={e => setRA(Number(e.target.value))} />
            <button className="btn" onClick={recharge}
              style={{ width:'100%', padding:'16px', borderRadius:16, background:'linear-gradient(135deg,#16A34A,#22C55E)', color:'#fff', fontWeight:900, fontSize:16, border:'none', cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
              Pay Rs.{rechAmt} via UPI
            </button>
            <button className="btn btn-outline" onClick={() => setShowRec(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Drive tab */}
      {tab === 'drive' && (
        <>
          <div style={{ position:'absolute', inset:0 }}>
            <MapView
              center={gps || [22.5726, 88.3639]}
              driverCoords={gps}
              pickupCoords={active ? [active.pickup_lat, active.pickup_lng] : null}
              dropCoords={active ? [active.drop_lat, active.drop_lng] : null}
              showRoute={rideState==='riding' || rideState==='active'}
              zoom={15}
              bottomPad={60}
              onReady={() => setMapReady(true)}
            />
            <SkeletonMap visible={!mapReady} />
          </div>

          {/* Top bar */}
          <div style={{ position:'absolute', top:'var(--safe-top)', left:0, right:0, zIndex:30, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(255,255,255,0.92)', backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', borderBottom:'1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#16A34A,#22C55E)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, color:'#fff', flexShrink:0 }}>
                {initials}
              </div>
              <div>
                <div style={{ fontWeight:800, fontSize:14 }}>{profile?.name?.split(' ')[0]}</div>
                <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>
                  {(profile?.rating || 5).toFixed(1)} stars | Today: {fmtRs(todayEarnings)}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {lowBal && <span style={{ fontSize:11, color:'var(--red)', fontWeight:700 }}>Low wallet</span>}
              <button onClick={toggleOnline}
                style={{ padding:'8px 16px', borderRadius:20, border:'none', cursor:'pointer', background:online?'#22C55E':'#374151', color:'#fff', fontWeight:800, fontSize:13, fontFamily:'inherit', boxShadow:online?'0 4px 14px rgba(34,197,94,0.4)':'none', transition:'all 0.25s' }}>
                {online ? 'Online' : 'Offline'}
              </button>
            </div>
          </div>

          {/* Safety bar */}
          {isActive && active && (
            <div style={{ position:'absolute', top:68, left:0, right:0, zIndex:25 }}>
              <SafetyBar rideId={active.id} userId={profile.id} role="driver" gps={gps} onReport={() => setSR(true)} />
            </div>
          )}

          {/* Low wallet */}
          {cancelStats?.daily_cancellations >= 2 && !isActive && (
            <div style={{ position:'absolute', top: lowBal ? 110 : 68, left:12, right:12, zIndex:24, background:'rgba(245,158,11,0.95)', backdropFilter:'blur(8px)', borderRadius:14, padding:'10px 14px', display:'flex', gap:10, alignItems:'center', color:'#fff' }}>
              <span>⚠️</span>
              <div style={{ flex:1, fontSize:13, fontWeight:600 }}>
                {cancelStats.daily_cancellations} cancellations today
                {cancelStats.daily_cancellations >= 3 ? ' — Rating reduced!' : ' — 1 more will reduce your rating'}
              </div>
            </div>
          )}
          {lowBal && !isActive && (
            <div style={{ position:'absolute', top:68, left:12, right:12, zIndex:25, background:'rgba(220,38,38,0.95)', backdropFilter:'blur(8px)', borderRadius:14, padding:'10px 14px', display:'flex', gap:10, alignItems:'center', color:'#fff' }}>
              <span>⚠️</span>
              <div style={{ flex:1, fontSize:13, fontWeight:600 }}>Wallet Rs.{wallet?.balance} - Min Rs.{MIN_BAL} to go online</div>
              <button onClick={() => setShowRec(true)} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', fontWeight:800, fontSize:12, padding:'6px 12px', borderRadius:10, cursor:'pointer', fontFamily:'inherit' }}>Recharge</button>
            </div>
          )}

          {/* Bottom panel */}
          <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:20, background:'rgba(255,255,255,0.97)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)', borderRadius:'22px 22px 0 0', boxShadow:'0 -8px 32px rgba(0,0,0,0.12)', paddingBottom:`calc(12px + var(--safe-bottom))` }}>
            <div className="sheet-handle" />

            {/* IDLE */}
            {rideState === 'idle' && (
              <div className="anim-up" style={{ padding:'0 16px 16px' }}>
                {!online ? (
                  <div style={{ textAlign:'center', paddingTop:8 }}>
                    <div style={{ fontSize:44, marginBottom:6 }}>🛵</div>
                    <div style={{ fontSize:20, fontWeight:900, marginBottom:4 }}>
                      {profile?.status==='approved' ? 'You are Offline' : 'Application Pending'}
                    </div>
                    <div style={{ fontSize:13, color:'var(--text3)', marginBottom:20 }}>
                      {profile?.status==='approved'
                        ? 'Go online to start receiving ride requests'
                        : 'Your documents are under review. You will be notified on WhatsApp once approved (within 24 hours).'}
                    </div>
                    {profile?.status?.toLowerCase()!=='approved' && (
                      <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:14, padding:'12px 16px', marginBottom:16, fontSize:13, color:'#92400E', textAlign:'left', lineHeight:1.6 }}>
                        <div style={{ fontWeight:700, marginBottom:4 }}>Documents submitted:</div>
                        {[{l:'Driving Licence',ok:!!profile?.license_url},{l:'Vehicle Plate Photo',ok:!!profile?.vehicle_plate_url},{l:'RC Book',ok:!!profile?.rc_url}].map(d=>(
                          <div key={d.l} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:2 }}>
                            <span>{d.ok?'✅':'⏳'}</span><span>{d.l}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Hot zones heatmap */}
                    <button onClick={() => setShowDemo(true)}
                      style={{ width:'100%', marginBottom:10, padding:'12px', borderRadius:14, border:'1.5px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.06)', color:'#EF4444', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      🔥 View Hot Zones & Demo
                    </button>

                    <button onClick={toggleOnline} disabled={!!lowBal||profile?.status?.toLowerCase()!=='approved'}
                      style={{ width:'100%', padding:'18px', borderRadius:18, background:lowBal||profile?.status?.toLowerCase()!=='approved'?'var(--bg3)':'linear-gradient(135deg,#22C55E,#16A34A)', color:lowBal||profile?.status?.toLowerCase()!=='approved'?'var(--text3)':'#fff', fontSize:18, fontWeight:900, border:'none', cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.02em', boxShadow:lowBal?'none':'0 8px 28px rgba(34,197,94,0.4)' }}>
                      {profile?.status?.toLowerCase()!=='approved' ? 'Awaiting Approval' : lowBal ? 'Recharge Wallet First' : 'GO ONLINE'}
                    </button>

                    {/* Demo mode button */}
                    <button onClick={() => setShowDemo(true)}
                      style={{ width:'100%', marginTop:10, padding:'13px', borderRadius:14, border:'1.5px solid rgba(255,95,31,0.4)', background:'rgba(255,95,31,0.06)', color:'var(--brand)', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      🎮 Preview Demo Ride
                    </button>

                    {/* Logout always accessible even when pending */}
                    <button onClick={signOut}
                      style={{ width:'100%', marginTop:10, padding:'13px', borderRadius:14, border:'1.5px solid rgba(220,38,38,0.3)', background:'transparent', color:'var(--red)', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign:'center', paddingTop:8 }}>
                    <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}>
                      <div style={{ width:56, height:56, position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'3px solid var(--green)', opacity:0.3, animation:'jc-pulse 2s ease-out infinite' }} />
                        <div style={{ fontSize:28 }}>🛵</div>
                      </div>
                    </div>
                    <div style={{ fontSize:17, fontWeight:800, marginBottom:3 }}>Waiting for rides...</div>
                    <div style={{ fontSize:13, color:'var(--text3)', marginBottom:18 }}>You will be notified instantly</div>
                    <div style={{ display:'flex', gap:8 }}>
                      {[
                        { v:todayRides, l:'Today rides' },
                        { v:fmtRs(todayEarnings), l:'Today earned' },
                        { v:`${(profile?.rating || 5).toFixed(1)} stars`, l:'Rating' },
                      ].map(s => (
                        <div key={s.l} style={{ flex:1, background:'var(--bg2)', borderRadius:14, padding:'10px 6px', textAlign:'center' }}>
                          <div style={{ fontWeight:900, fontSize:15, color:'var(--green)' }}>{s.v}</div>
                          <div style={{ fontSize:10, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.04em', marginTop:2 }}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                    <button onClick={toggleOnline}
                      style={{ marginTop:14, width:'100%', padding:'14px', borderRadius:16, border:'1.5px solid rgba(220,38,38,0.3)', background:'transparent', color:'var(--red)', fontWeight:800, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>
                      Go Offline
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ACTIVE: navigating to pickup */}
            {rideState === 'active' && active && pax && (
              <div className="anim-up" style={{ padding:'0 16px 8px' }}>
                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  <div style={{ flex:1, background:'#ECFDF5', borderRadius:14, padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:900, color:'#16A34A' }}>{pickupEta ? `${pickupEta.distKm} km` : '...'}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:'#16A34A', opacity:0.7, textTransform:'uppercase', letterSpacing:'0.04em' }}>To Pickup</div>
                  </div>
                  <div style={{ flex:1, background:'var(--bg2)', borderRadius:14, padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:900, color:'var(--brand)' }}>{fmtRs(active.driver_earnings || (active.fare || 0) * 0.9)}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--brand)', opacity:0.7, textTransform:'uppercase', letterSpacing:'0.04em' }}>Earnings</div>
                  </div>
                  <div style={{ flex:1, background:'var(--bg2)', borderRadius:14, padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:900 }}>{pickupEta ? `${pickupEta.mins}m` : '...'}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.04em' }}>ETA</div>
                  </div>
                </div>

                <div style={{ background:'var(--bg2)', borderRadius:14, padding:'12px 14px', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:13, flexShrink:0 }}>
                      {pax.name?.slice(0,2).toUpperCase() || 'P'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:14 }}>{active.rider_name || pax.name}</div>
                      <div style={{ fontSize:12, color:'var(--text3)' }}>Tap Chat to message</div>
                    </div>
                    <span className="badge badge-green">On way</span>
                  </div>
                  {[{ l:'Pickup', v:active.pickup_address },{ l:'Drop', v:active.drop_address }].map(r => (
                    <div key={r.l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, color:'var(--text3)', fontWeight:600, flexShrink:0 }}>{r.l}</span>
                      <span style={{ fontSize:12, fontWeight:700, maxWidth:'62%', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  <button onClick={() => setChat(true)} className="btn btn-ghost btn-sm" style={{ flex:1, borderRadius:12, color:'var(--brand)' }}><ChatIcon /> Chat</button>
                  <button className="btn btn-ghost btn-sm" style={{ flex:1, borderRadius:12 }} onClick={() => setChat(true)}><ChatIcon /> Chat</button>
                  <a href={`https://wa.me/${(active.rider_phone||pax.phone)?.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ flex:1, borderRadius:12, color:'#25D366' }}><WaIcon /></a>
                </div>

                <button onClick={arrivedAtPickup}
                  style={{ width:'100%', padding:'13px', borderRadius:14, border:'1.5px solid #22C55E', background:'#ECFDF5', color:'#16A34A', fontWeight:800, fontSize:14, cursor:'pointer', fontFamily:'inherit', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <NavIcon /> I have Arrived at Pickup
                </button>

                <button onClick={openDriverCancelModal}
                  style={{ width:'100%', padding:'11px', borderRadius:14, border:'1.5px solid rgba(220,38,38,0.3)', background:'transparent', color:'var(--red)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
                  Cancel Ride
                </button>

                <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:16, padding:'14px 16px' }}>
                  <div style={{ fontWeight:800, fontSize:14, color:'#92400E', marginBottom:2 }}>Enter OTP to Start Ride</div>
                  <div style={{ fontSize:12, color:'#92400E', opacity:0.8, marginBottom:12 }}>Ask passenger for their 4-digit code</div>
                  <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:10 }}>
                    {otpEntry.map((d, i) => (
                      <input key={i} ref={el => otpRefs.current[i]=el}
                        style={{ width:50, height:60, textAlign:'center', fontSize:26, fontWeight:900, background:'#fff', border:`2.5px solid ${otpError?'var(--red)':d?'var(--green)':'#E0E0E0'}`, borderRadius:14, outline:'none', fontFamily:'inherit', color:'var(--text)', userSelect:'text', WebkitUserSelect:'text' }}
                        value={d} maxLength={1} inputMode="numeric"
                        onChange={e => handleOtpInput(i, e.target.value)} onKeyDown={e => otpKey(i, e)}
                      />
                    ))}
                  </div>
                  {otpError && <div style={{ fontSize:12, color:'var(--red)', textAlign:'center', marginBottom:8 }}>{otpError}</div>}
                  <button className="btn btn-primary" onClick={verifyOTP} disabled={otpLoad || otpEntry.join('').length !== 4}>
                    {otpLoad ? <span className="spinner-sm" /> : 'Verify OTP and Start Ride'}
                  </button>
                </div>
              </div>
            )}

            {/* RIDING */}
            {rideState === 'riding' && active && (
              <div className="anim-up" style={{ padding:'0 16px 8px' }}>
                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  {[
                    { v:rideTimer, l:'Time', c:'var(--brand)' },
                    { v:`${parseFloat(active.distance_km || 0).toFixed(1)} km`, l:'Distance' },
                    { v:fmtRs(active.driver_earnings || (active.fare || 0) * 0.9), l:'Earnings', c:'var(--green)' },
                  ].map(s => (
                    <div key={s.l} style={{ flex:1, background:s.c?'rgba(0,0,0,0.04)':'var(--bg2)', borderRadius:14, padding:'10px 6px', textAlign:'center' }}>
                      <div style={{ fontSize:17, fontWeight:900, color:s.c || 'var(--text)' }}>{s.v}</div>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.04em', marginTop:2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <DriverFareCard
                  fare={{ totalFare:active.fare, platformCommission:active.platform_commission, driverEarnings:active.driver_earnings, distanceKm:active.distance_km }}
                  payMethod={active.payment_method}
                  style={{ marginBottom:12 }}
                />
                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex:1, borderRadius:12 }} onClick={() => setChat(true)}><ChatIcon /> Chat</button>
                  <button onClick={() => setChat(true)} className="btn btn-ghost btn-sm" style={{ flex:1, borderRadius:12, color:'var(--brand)' }}><ChatIcon /> Chat</button>
                </div>
                <button onClick={endRide}
                  style={{ width:'100%', padding:'16px', borderRadius:16, background:'linear-gradient(135deg,#DC2626,#EF4444)', color:'#fff', fontWeight:900, fontSize:16, border:'none', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 6px 22px rgba(220,38,38,0.35)' }}>
                  End Ride
                </button>
              </div>
            )}

            {/* DONE */}
            {rideState === 'done' && (
              <div className="anim-up" style={{ padding:'8px 16px 16px', textAlign:'center' }}>
                <div style={{ fontSize:44, marginBottom:8 }}>🎉</div>
                <div style={{ fontSize:22, fontWeight:900, marginBottom:4 }}>Ride Complete!</div>
                <div style={{ fontSize:14, color:'var(--text3)' }}>Looking for next ride...</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Earnings tab */}
      {tab === 'earnings' && (
        <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'var(--bg)' }}>
          <div style={{ padding:'14px 16px', background:'#fff', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div className="t-h1">Earnings</div>
          </div>
          <div className="scroll" style={{ flex:1, padding:'12px 14px 80px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { l:'Today', v:fmtRs(todayEarnings), sub:`${todayRides} rides`, c:'var(--green)' },
                { l:'All-time', v:fmtRs(history.filter(r=>r.ride_status==='completed').reduce((s,r)=>s+(r.driver_earnings||0),0)), sub:'total earned', c:'var(--brand)' },
                { l:'Total Rides', v:history.filter(r=>r.ride_status==='completed').length, sub:'completed', c:'var(--blue)' },
                { l:'Rating', v:`${(profile?.rating||5).toFixed(1)} stars`, sub:'avg score', c:'#F59E0B' },
              ].map(s => (
                <div key={s.l} className="card-raised" style={{ textAlign:'center' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>{s.l}</div>
                  <div style={{ fontWeight:900, fontSize:22, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{s.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:10 }}>Recent Rides</div>
            {!history.length && !income && <SkeletonEarnings />}
            {history.map(r => (
              <div key={r.id} className="card-raised" style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, color:'var(--text3)' }}>{new Date(r.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                  <span className={`badge ${r.ride_status==='completed'?'badge-green':'badge-red'}`}>{r.ride_status}</span>
                </div>
                <div style={{ fontWeight:700, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>{r.pickup_address}</div>
                <div style={{ fontSize:12, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:8 }}>Drop: {r.drop_address}</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:900, color:'var(--green)', fontSize:17 }}>{fmtRs(r.driver_earnings||0)}</span>
                  <span className="badge badge-gray">{(r.payment_method||'').toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wallet tab */}
      {tab === 'wallet' && (
        <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'var(--bg)' }}>
          <div style={{ padding:'14px 16px', background:'#fff', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div className="t-h1">Wallet</div>
          </div>
          <div className="scroll" style={{ flex:1, padding:'12px 14px 80px' }}>
            <div className="wallet-card" style={{ marginBottom:18 }}>
              <div style={{ fontSize:11, marginBottom:6, opacity:0.75, textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:700, color:'#fff' }}>Wallet Balance</div>
              <div style={{ fontWeight:900, fontSize:42, marginBottom:8, color:'#fff' }}>Rs.{wallet?.balance?.toFixed(0)||'0'}</div>
              {wallet?.outstanding_commission > 0 && (
                <div style={{ display:'inline-block', background:'rgba(255,255,255,0.2)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, marginBottom:14, color:'#fff' }}>
                  Outstanding: Rs.{wallet.outstanding_commission}
                </div>
              )}
              <button className="btn" style={{ background:'#fff', color:'var(--brand)', fontWeight:700, padding:'12px 20px', borderRadius:12, fontSize:14 }} onClick={() => setShowRec(true)}>
                + Recharge
              </button>
            </div>
            <div className="card" style={{ marginBottom:14 }}>
              <div className="t-h3" style={{ marginBottom:12 }}>Commission Structure</div>
              {[
                ['Platform commission','10% flat','var(--brand)'],
                ['Bike','Rs.8/km, Min Rs.20','var(--text)'],
                ['Auto','Rs.12/km, Min Rs.35','var(--text)'],
                ['Cab Non-AC','Rs.15/km, Min Rs.40','var(--text)'],
                ['Cab AC','Rs.17/km, Min Rs.50','var(--text)'],
                ['Cash ride','Commission added to outstanding','var(--red)'],
                ['Auto-cleared','On next wallet recharge','var(--green)'],
              ].map(([l,v,c]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                  <span style={{ color:'var(--text3)' }}>{l}</span>
                  <span style={{ fontWeight:700, color:c }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background:'var(--brand-light)', border:'1px solid rgba(255,95,31,0.2)', borderRadius:12, padding:'12px 14px', fontSize:13, color:'var(--brand-text)', lineHeight:1.6 }}>
              Keep wallet above Rs.{MIN_BAL} to stay online. Below that, rides are paused automatically.
            </div>
          </div>
        </div>
      )}

      {/* Profile tab */}
      {tab === 'profile' && (
        <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'var(--bg)' }}>
          <div style={{ padding:'14px 16px', background:'#fff', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div className="t-h1">Profile</div>
          </div>
          <div className="scroll" style={{ flex:1, padding:'12px 14px 80px' }}>
            <div style={{ textAlign:'center', padding:'20px 0 24px' }}>
              <div style={{ width:76, height:76, borderRadius:'50%', background:'linear-gradient(135deg,#16A34A,#22C55E)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:28, color:'#fff', margin:'0 auto 12px' }}>{initials}</div>
              <div className="t-h1">{profile?.name}</div>
              <div className="t-body t-muted" style={{ marginTop:4 }}>{profile?.phone}</div>
              <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:10 }}>
                <span className={`badge ${profile?.status==='approved'?'badge-green':'badge-orange'}`}>{profile?.status==='approved'?'Verified':'Pending'}</span>
                <span className="badge badge-gray">{profile?.vehicle_model}</span>
              </div>
            </div>
            {[
              { e:'🚗', l:'Vehicle Details' },
              { e:'📄', l:'Documents' },
              { e:'🏦', l:'Bank Account' },
              { e:'🛡️', l:'Emergency Contacts', a:() => setShowEC(true), red:true },
              { e:'❓', l:'Help and Support' },
            ].map(item => (
              <button key={item.l} onClick={item.a || undefined}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'14px', background:'#fff', border:'1px solid var(--border)', borderRadius:14, marginBottom:6, cursor:'pointer', fontFamily:'inherit' }}>
                <span style={{ fontSize:20 }}>{item.e}</span>
                <span style={{ fontWeight:700, fontSize:15, flex:1, textAlign:'left', color:item.red?'var(--red)':'var(--text)' }}>{item.l}</span>
                <ChevR />
              </button>
            ))}
            <button className="btn btn-outline" style={{ marginTop:8, color:'var(--red)', borderColor:'rgba(220,38,38,0.25)' }} onClick={signOut}>
              <OutIcon /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav - hidden when map fullscreen and in drive tab */}
      <div className="bottom-nav" style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:tab==='drive'?0:10 }}>
        {[
          { id:'drive',    l:'Drive',    e:'🛵' },
          { id:'earnings', l:'Earnings', e:'💰' },
          { id:'wallet',   l:'Wallet',   e:'👛' },
          { id:'profile',  l:'Profile',  e:'👤' },
        ].map(t => (
          <button key={t.id} className={`nav-item ${tab===t.id?'active':''}`}
            onClick={() => { window.history.pushState({ jcDTab:t.id }, ''); setTab(t.id) }}>
            <span style={{ fontSize:22 }}>{t.e}</span>{t.l}
          </button>
        ))}
      </div>
    </div>
  )
}
