import FinanceModule from './FinanceModule'

// Auth + onboarded gating handled by app/app/layout.tsx — this page only
// renders for authed, onboarded users. The module is a self-contained
// client tree (state lives in localStorage; BUILD13 will swap for Supabase).
export default function FinancePage() {
  return <FinanceModule />
}
