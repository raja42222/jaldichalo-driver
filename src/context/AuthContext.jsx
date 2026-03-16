import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase, doSignOut } from '../lib/supabase'

/* ================================================================
   AUTH CONTEXT v3 — Driver App
   Same session-persistence strategy as Customer app.
   All 5 session bugs fixed.
================================================================ */

const AuthCtx     = createContext(null)
const PROFILE_KEY = 'jc_driver_profile_v4'
const PROFILE_TTL = 30 * 24 * 60 * 60 * 1000
const REFETCH_GAP = 5 * 60 * 1000

const cache = {
  read() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      if (!raw) return null
      const p = JSON.parse(raw)
      if (!p?.data || !p?.ts) return null
      if (Date.now() - p.ts > PROFILE_TTL) { localStorage.removeItem(PROFILE_KEY); return null }
      return p
    } catch { return null }
  },
  write(data, userId) {
    if (!data || !userId) return
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ data, userId, ts: Date.now() }))
    } catch {}
  },
  clear() {
    try {
      ['jc_driver_profile_v4', 'jc_driver_pos']
        .forEach(k => localStorage.removeItem(k))
    } catch {}
  }
}

export function AuthProvider({ children }) {
  const initCache = cache.read()

  const [profile,   setProfile]   = useState(initCache?.data || null)
  const [loading,   setLoading]   = useState(false)
  const [oauthUser, setOauthUser] = useState(null)

  const mounted      = useRef(true)
  const lastFetchAt  = useRef(0)
  const directSetAt  = useRef(0)
  const sessionReady = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const fetchProfile = useCallback(async (userId, force = false) => {
    if (!userId || !mounted.current) return null
    if (!force && Date.now() - lastFetchAt.current < REFETCH_GAP) return 'throttled'
    lastFetchAt.current = Date.now()

    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (!mounted.current) return null
      if (data) {
        cache.write(data, userId)
        setProfile(data)
        setOauthUser(null)
        setLoading(false)
        return 'ok'
      }
      if (error) throw error
      return null
    } catch {
      if (!mounted.current) return null
      const c = cache.read()
      if (c?.userId === userId) {
        setProfile(c.data)
        setLoading(false)
        return 'cache'
      }
      return null
    }
  }, [])

  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      if (!mounted.current || sessionReady.current) return
      sessionReady.current = true
      const c = cache.read()
      if (c) { setProfile(c.data); setLoading(false) }
      else { setLoading(false) }
    }, 12000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted.current) return

        switch (event) {
          case 'INITIAL_SESSION': {
            clearTimeout(safetyTimer)
            sessionReady.current = true
            if (!session?.user) {
              const c = cache.read()
              if (c) { setProfile(c.data); setLoading(false) }
              else { setProfile(null); setLoading(false) }
              return
            }
            const c = cache.read()
            if (c?.userId === session.user.id) {
              setProfile(c.data); setLoading(false)
              fetchProfile(session.user.id).catch(() => {})
            } else {
              const res = await fetchProfile(session.user.id, true)
              if (!mounted.current) return
              if (res === null) {
                if (session.user.app_metadata?.provider === 'google') setOauthUser(session.user)
                setLoading(false)
              }
            }
            break
          }

          case 'SIGNED_IN': {
            if (!session?.user) break
            if (Date.now() - directSetAt.current < 30000) break
            const c = cache.read()
            if (c?.userId === session.user.id && c.data?.name) {
              setProfile(c.data); setLoading(false); break
            }
            lastFetchAt.current = 0
            const res = await fetchProfile(session.user.id, true)
            if (!mounted.current) return
            if (res === null) {
              if (session.user.app_metadata?.provider === 'google') setOauthUser(session.user)
              setLoading(false)
            }
            break
          }

          case 'TOKEN_REFRESHED': {
            setLoading(false)
            if (session?.user) fetchProfile(session.user.id).catch(() => {})
            break
          }

          case 'USER_UPDATED': {
            if (session?.user) fetchProfile(session.user.id, true).catch(() => {})
            break
          }

          case 'SIGNED_OUT': {
            clearTimeout(safetyTimer)
            cache.clear()
            directSetAt.current = 0
            lastFetchAt.current = 0
            if (mounted.current) { setProfile(null); setOauthUser(null); setLoading(false) }
            break
          }

          default: break
        }
      }
    )

    return () => { clearTimeout(safetyTimer); subscription.unsubscribe() }
  }, [fetchProfile])

  const setProfileDirect = useCallback((data) => {
    if (!data) { setLoading(false); return }
    directSetAt.current = Date.now()
    lastFetchAt.current = Date.now()
    cache.write(data, data.id)
    setProfile(data); setOauthUser(null); setLoading(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    lastFetchAt.current = 0
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await fetchProfile(user.id, true)
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    cache.clear()
    directSetAt.current = 0
    lastFetchAt.current = 0
    if (mounted.current) { setProfile(null); setOauthUser(null); setLoading(false) }
    await doSignOut()
  }, [])

  return (
    <AuthCtx.Provider value={{
      profile, role: 'driver', loading, oauthUser,
      setProfileDirect, refreshProfile, signOut
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
