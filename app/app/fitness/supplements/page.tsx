import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Supplements tracking moved into the Fuel page as a section (/app/fuel). This
 * route forwards there so old links/bookmarks keep working. The stack + taken
 * state still live in localStorage (`vitality_supplements_v1`), shared by both.
 *
 * The interface below is retained because the (now-unmounted) SupplementsModule
 * still imports it for its server-prop type; the AI recommender it powers will
 * be brought into the Fuel page in a later pass.
 */
export interface SupplementsServerProps {
  age: number | null
  sex: 'M' | 'F' | null
  goal: 'recomp' | 'cut' | 'bulk' | 'maintain' | 'general_health' | null
  gymLevel: 'beginner' | 'intermediate' | 'advanced' | null
}

export default function SupplementsRedirect() {
  redirect('/app/fuel')
}
