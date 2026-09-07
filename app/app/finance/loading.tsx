import { ModuleSkeleton } from '@/components/Skeleton'

// Instant frame while the Finance module (net worth · subs · orders) loads.
export default function FinanceLoading() {
  return <ModuleSkeleton />
}
