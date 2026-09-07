import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadNoticed, type NoticedData } from '@/lib/vee/loadNoticed'
import { buildHandoffContext, type ClaudeHandoffContext } from '@/lib/vee/claudeHandoff'
import { readFacts } from '@/lib/memory/userFacts'
import { MOOD_KIND, buildMoodStrip, localDateKey, type MoodPoint, type RawMoodFact } from '@/app/app/mentor/moodData'
import VeeNoticed from '@/components/VeeNoticed'
import type { FeedNotice } from '@/lib/insights/feed'
import type { Note } from '@/app/app/mentor/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vee' }

/**
 * /app/mentor-next - the new, launch-grade Vee: one vertical scroll. The Echo
 * gem (Vee's face) with the run-stats proof strip, the fused FULL goals engine
 * (authoring + per-goal live steering), the gamified "Vitality Noticed" card,
 * and the feed-Vee flywheel. A safe preview beside the untouched live /app/mentor.
 *
 * Gated server component: auth first, then load the same real engine data the
 * mentor page builds (extended with goals/guides/chips/stats), filter out the
 * cold-start "starter" (a promise, not a graded find; the cold-start card carries
 * its own fixed honest line), and hand the rest to VeeNoticed. Every read is
 * RLS-scoped and best-effort; a data failure or a new account falls through to
 * calm empties. The page never throws.
 */
export default async function MentorNextPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let firstName: string | null = null
  const feed: FeedNotice[] = []
  let rows: NoticedData['rows'] = []
  let guides: NoticedData['guides'] = {}
  let lifeChips: NoticedData['lifeChips'] = []
  let stats: NoticedData['stats'] = { daysLogged: 0, modulesFeeding: 0, insightsFound: 0, rarestTier: null }
  let goals: NoticedData['goals'] = []
  let habits: NoticedData['habits'] = []
  let suggestionEvidence: NoticedData['suggestionEvidence'] = { train: false, protein: false, sleep: false }
  let tileStreams: NoticedData['tileStreams'] = []
  let activeModules: NoticedData['activeModules'] = []
  let notes: Note[] = []
  let moodHistory: MoodPoint[] = []
  let moodFacts: RawMoodFact[] = []
  let claudeContext: ClaudeHandoffContext | null = null
  // A failed read must never impersonate a cold start: loadNoticed flags any
  // batched-read failure, and a total failure here flips it too.
  let degraded = false

  try {
    const [data, notesRes, factsRes] = await Promise.all([
      loadNoticed(supabase, user.id),
      supabase.from('notes').select('id, body, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
      readFacts(supabase, user.id).catch(() => []),
    ])
    firstName = data.firstName
    for (const n of data.feed) {
      if (n.source !== 'starter') feed.push(n)
    }
    rows = data.rows
    guides = data.guides
    lifeChips = data.lifeChips
    stats = data.stats
    goals = data.goals
    habits = data.habits
    suggestionEvidence = data.suggestionEvidence
    tileStreams = data.tileStreams
    activeModules = data.activeModules
    degraded = data.degraded || notesRes.error != null
    notes = (notesRes.data ?? []) as Note[]
    // Mood: last 7 days from the user_facts mood rows (newest-first). The server
    // strip is only the SSR initial; the client rebuilds it from moodFacts with
    // the browser clock so day boundaries are the user's, not the server's.
    moodFacts = factsRes.filter(f => f.kind === MOOD_KIND).map(f => ({ body: f.body, createdAt: f.createdAt }))
    moodHistory = buildMoodStrip(moodFacts, localDateKey(), 7)
    // The Claude handoff context: assembled here from data loadNoticed already
    // fetched (zero extra reads), so a question opened in Claude arrives with
    // the user's real goals, states, latest find and live stats attached.
    claudeContext = buildHandoffContext({
      firstName: data.firstName,
      daysLogged: data.stats.daysLogged,
      goals: data.goals
        .filter(g => g.status === 'active')
        .sort((a, b) => b.priority - a.priority)
        .map(g => ({ id: g.id, title: g.title, cleanTitle: g.cleanTitle, category: g.category })),
      rows: data.rows,
      feed,
      lifeChips: data.lifeChips,
      activeModules: data.activeModules,
    })
  } catch {
    // Best-effort: calm empties render, never an error - flagged degraded so the
    // page says "could not read" instead of showing cold-start copy.
    degraded = true
  }

  return (
    <VeeNoticed
      firstName={firstName}
      feed={feed}
      userId={user.id}
      stats={stats}
      goals={goals}
      habits={habits}
      rows={rows}
      guides={guides}
      lifeChips={lifeChips}
      suggestionEvidence={suggestionEvidence}
      tileStreams={tileStreams}
      activeModules={activeModules}
      notes={notes}
      moodHistory={moodHistory}
      moodFacts={moodFacts}
      claudeContext={claudeContext}
      degraded={degraded}
    />
  )
}
