import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Water tracking moved into the Fuel page as a section (/app/fuel). This route
 * forwards there so old links/bookmarks keep working. The water state + logs
 * still live in localStorage (`vitality_water_v1`), shared by both.
 */
export default function WaterRedirect() {
  redirect('/app/fuel')
}
