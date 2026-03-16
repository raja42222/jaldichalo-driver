import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || 'https://zjozftsvrvwzewxwonaj.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_o6_pVp2xLoDNrGsUBoeRjw_Gb8yuAAL'

const COOKIE_NAME = 'jc_dr_sb_session'
const COOKIE_DAYS = 7

function setCookie(value) {
  try {
    const expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString()
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Strict`
  } catch {}
}
function getCookie() {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
  } catch { return null }
}
function delCookie() {
  try {
    document.cookie = `${COOKIE_NAME}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  } catch {}
}

const dualStorage = {
  getItem(key) {
    try { const v = localStorage.getItem(key); if (v) return v } catch {}
    try { const c = getCookie(); if (c) { const o = JSON.parse(c); if (o?.key === key) return o.value } } catch {}
    return null
  },
  setItem(key, value) {
    try { localStorage.setItem(key, value) } catch {}
    try { setCookie(JSON.stringify({ key, value })) } catch {}
  },
  removeItem(key) {
    try { localStorage.removeItem(key) } catch {}
    delCookie()
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
    storage:            dualStorage,
    storageKey:         'jc_driver_session',
    flowType:           'implicit',
    debug:              false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
    reconnectDelay: 2000,
  },
  global: {
    fetch: (url, options) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20000)
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer))
    }
  }
})

export async function doSignOut() {
  try { await supabase.auth.signOut() } catch {}
  const keys = ['jc_driver_session', 'jc_driver_profile_v4', 'jc_driver_pos', 'jc_device_id']
  keys.forEach(k => { try { localStorage.removeItem(k) } catch {} })
  delCookie()
}
