import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * The macro tracker now lives at /app/fuel (Macros is the spine of the Fuel
 * page, with Water + Supplements folded in as sections). This route just
 * forwards there so old links/bookmarks keep working.
 */
export default function MacrosRedirect() {
  redirect('/app/fuel')
}
