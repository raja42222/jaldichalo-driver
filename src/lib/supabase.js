import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || 'https://lozejdisdkrqdfkmpifa.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_z_l8vKeB_qFV2Rz21dY7bg_0x27puzF'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
    storage:            localStorage,
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
      const timer = setTimeout(() => controller.abort(), 15000)
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer))
    }
  }
})

export async function doSignOut() {
  try { await supabase.auth.signOut() } catch {}
  const keys = ['jc_driver_profile_v4', 'jc_driver_pos', 'jc_device_id']
  keys.forEach(k => { try { localStorage.removeItem(k) } catch {} })
}
