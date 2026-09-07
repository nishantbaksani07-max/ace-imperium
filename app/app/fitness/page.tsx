import { redirect } from 'next/navigation'

/**
 * The standalone "Fitness" sub-dashboard was retired in the 6-tile
 * consolidation — Train opens the Workout Logger directly, and the old hub's
 * other modules now live under their natural tiles (weight/supplements under
 * Fuel, wearables under Peak, goals under Mind). This route forwards to the
 * logger so the Train tile, old bookmarks, and the setup wizard's
 * `router.push('/app/fitness')` all keep working.
 *
 * Gating: the logger (/app/fitness/log) self-gates on the training setup
 * (`training_settings.setup_complete`) and redirects to /app/fitness/setup
 * when it's not done — so Train is walled behind its own setup. (Previously
 * this page gated on the now-removed Goal quiz.)
 */
export default async function FitnessPage() {
  redirect('/app/fitness/log')
}
