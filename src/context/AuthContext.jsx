import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase, doSignOut } from '../lib/supabase'

/* ================================================================
   AUTH CONTEXT  —  Driver App
   Same session-persistence strategy as Customer app.
================================================================ */

const AuthCtx     = createContext(null)
const PROFILE_KEY = 'jc_driver_profile_v4'
const SESSION_KEY = 'jc_driver_session'
const PROFILE_TTL = 30 * 24 * 60 * 60 * 1000
const REFRESH_GAP = 60 * 1000

const cache = {
  read() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      if (!raw) return null
      const p = JSON.parse(raw)
      if (Date.now() - p.ts > PROFILE_TTL) { localStorage.removeItem(PROFILE_KEY); return null }
      return p
    } catch { return null }
  },
  write(data, userId) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        data, role: 'driver', userId, ts: Date.now()
      }))
    } catch {}
  },
  clear() {
    try {
      [PROFILE_KEY, 'jc_driver_pos'].forEach(k => localStorage.removeItem(k))
    } catch {}
  },
  hasValidSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return false
      const s = JSON.parse(raw)
      const exp = s?.expires_at || s?.session?.expires_at || 0
      return Date.now() / 1000 < exp + 60
    } catch { return false }
  }
}

export function AuthProvider({ children }) {
  const cached         = cache.read()
  const hasStoredToken = cache.hasValidSession()

  const [profile,   setProfile]   = useState(cached?.data || null)
  const [loading,   setLoading]   = useState(!cached?.data && hasStoredToken)
  const [oauthUser, setOauthUser] = useState(null)

  const directSetAt = useRef(0)
  const lastFetchAt = useRef(0)
  const mounted     = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const fetchProfile = useCallback(async (userId, force = false) => {
    if (!userId) return null
    if (!force && Date.now() - lastFetchAt.current < REFRESH_GAP) return 'cached'
    lastFetchAt.current = Date.now()

    try {
      const { data: dr, error } = await supabase
        .from('drivers').select('*').eq('id', userId).maybeSingle()
      if (!mounted.current) return null
      if (dr) {
        cache.write(dr, userId)
        setProfile(dr)
        setOauthUser(null)
        setLoading(false)
        return 'driver'
      }
      if (error) throw error
    } catch {
      if (!mounted.current) return null
      const c = cache.read()
      if (c && c.userId === userId) {
        setProfile(c.data)
        setLoading(false)
        return 'driver'
      }
    }
    return null
  }, [])

  useEffect(() => {
    const fallback = setTimeout(() => {
      if (!mounted.current) return
      const c = cache.read()
      if (c) { setProfile(c.data); setLoading(false) }
      else setLoading(false)
    }, 8000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted.current) return
      clearTimeout(fallback)

      switch (event) {
        case 'INITIAL_SESSION': {
          if (!session?.user) {
            const c = cache.read()
            if (c) setLoading(false)
            else { setProfile(null); setLoading(false) }
            return
          }
          const c = cache.read()
          if (c && c.userId === session.user.id) {
            setProfile(c.data)
            setLoading(false)
            fetchProfile(session.user.id).catch(() => {})
          } else {
            const r = await fetchProfile(session.user.id, true)
            if (!mounted.current) return
            if (r === null) {
              if (session.user.app_metadata?.provider === 'google') setOauthUser(session.user)
              setLoading(false)
            }
          }
          break
        }

        case 'SIGNED_IN': {
          if (!session?.user) break
          if (Date.now() - directSetAt.current < 30000) { setLoading(false); break }
          const c = cache.read()
          if (c && c.userId === session.user.id) { setLoading(false); break }
          const r = await fetchProfile(session.user.id, true)
          if (!mounted.current) return
          if (r === null) {
            if (session.user.app_metadata?.provider === 'google') setOauthUser(session.user)
            setLoading(false)
          }
          break
        }

        case 'TOKEN_REFRESHED': {
          if (!mounted.current) return
          setLoading(false)
          if (session?.user) fetchProfile(session.user.id).catch(() => {})
          break
        }

        case 'USER_UPDATED': {
          if (session?.user) fetchProfile(session.user.id, true).catch(() => {})
          break
        }

        case 'SIGNED_OUT': {
          cache.clear()
          directSetAt.current = 0
          lastFetchAt.current = 0
          if (mounted.current) { setProfile(null); setOauthUser(null); setLoading(false) }
          break
        }

        default: break
      }
    })

    return () => {
      clearTimeout(fallback)
      subscription.unsubscribe()
    }
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
    await doSignOut()
    cache.clear()
    directSetAt.current = 0
    lastFetchAt.current = 0
    if (mounted.current) { setProfile(null); setOauthUser(null); setLoading(false) }
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
