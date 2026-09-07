import VeeFeed from '@/components/VeeFeed'

export const dynamic = 'force-static'
export const metadata = { title: 'Imperium · preview' }

/** No-auth preview: the feed-first Imperium surface (Imperium Noticed) — the rarity
 *  collection, the rarity-graded insight feed with detailed/simple toggle, the
 *  climb signal, and the engine ladder. Example data, not live. */
export default function Page() {
  return <VeeFeed />
}
