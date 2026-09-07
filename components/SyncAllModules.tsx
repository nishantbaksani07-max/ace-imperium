'use client'

import { useEffect } from 'react'
import { reconcileOwner, hydrateFromServer, syncAllModules } from '@/lib/sync/syncAllModules'

/**
 * Fire-and-forget two-way sync on app load, in order:
 *   1. RECONCILE OWNER — if this device's localStorage belongs to a different
 *      user (shared device after a sign-out), wipe it so we never show or push
 *      someone else's data. Must run first.
 *   2. HYDRATE — pull server → local for modules this device hasn't got, so a
 *      fresh device (or one just wiped in step 1) shows the user's own data.
 *   3. PUSH — mirror every non-empty local blob to Supabase so the server + MCP
 *      see data from modules the user hasn't opened.
 * Each step is guarded so none overwrites real data. Renders nothing.
 */
export default function SyncAllModules() {
  useEffect(() => {
    void (async () => {
      await reconcileOwner()
      await hydrateFromServer()
      await syncAllModules()
    })()
  }, [])
  return null
}
