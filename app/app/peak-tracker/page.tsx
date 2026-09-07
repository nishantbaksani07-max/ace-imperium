import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * The Peak planner has been unified into the main Peak dashboard — the "Your
 * Day" schedule (quick-add console + vertical day calendar) now lives on
 * /app/peak. This route redirects there. The peak-tracker building blocks
 * (parser, actions, types, curve, loadSchedule) are still imported by the
 * unified dashboard.
 */
export default function PeakTrackerPage() {
  redirect('/app/peak')
}
