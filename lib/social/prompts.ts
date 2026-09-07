import type { SocialPlatform } from './types'

/**
 * Generates the READ-ONLY prompt the user pastes into their Claude Chrome
 * extension. The extension reads the analytics page that's already open in the
 * user's browser (logged in as them) and prints the numbers back in a strict
 * KEY: value format so our paste-back parser (`parse.ts`) can read it reliably.
 *
 * We never touch the extension from the app (browsers forbid that) and we never
 * scrape these platforms server-side — this is the human-in-the-loop bridge.
 */

const READ_ONLY =
  'You are a READ-ONLY analytics reader. Do not post, like, follow, change settings, or click anything that modifies the account. Only read what is already on screen.'

const WHERE: Record<SocialPlatform, string> = {
  instagram:
    'Open Instagram on the web or app, go to Professional dashboard → Insights, and set the range to the last 28 days. Look at account-level totals.',
  tiktok:
    'Open TikTok, go to Creator tools → Analytics → Overview, and set the range to the last 28 days. Use the Content + Followers tabs.',
  youtube:
    'Open YouTube Studio → Analytics, set the range to the last 28 days, and use the Overview + Audience tabs.',
  other:
    'Open your platform’s analytics/insights page and set the range to the last 28 days.',
}

export function buildExtensionPrompt(platform: SocialPlatform, handle?: string): string {
  const who = handle ? ` for ${handle}` : ''
  return `You are a READ-ONLY analytics reader. Do not post, like, follow, change settings, or click anything that modifies the account. Only read what is already on screen.

${WHERE[platform]}

Read my ${platform} analytics${who} for the LAST 28 DAYS and report the account-level numbers. If a number isn't shown, write "n/a" — never guess.

Reply with ONLY this block, one metric per line, numbers as plain digits (no commas, no "K"/"M" — expand them):

PLATFORM: ${platform}
PERIOD: last 28 days
FOLLOWERS: <total follower/subscriber count>
VIEWS: <views or impressions>
REACH: <accounts reached / unique viewers>
NON_FOLLOWER_PCT: <% of views from non-followers>
LIKES: <total likes>
COMMENTS: <total comments>
SAVES: <total saves / bookmarks>
SHARES: <total shares>
FOLLOWS: <new follows in the period>
ENGAGEMENT_RATE: <engagement rate % if shown>
TOP_COMMENTS:
- <a notable recent comment, verbatim>
- <another>
- <another>

After the block, add nothing else.`
}

/**
 * READ-ONLY prompt that reads the PUBLISH DATES of recent posts on an account.
 * Lets the brand page show "last posted" + a content calendar without the user
 * ever logging a ship by hand — the Chrome extension reads the real post grid.
 * Output is strict so `parsePostDates` can read it reliably.
 */
export function buildPostDatesPrompt(platform: SocialPlatform, handle?: string): string {
  const w = handle ? ` for ${handle}` : ''
  const where =
    platform === 'youtube'
      ? 'Open YouTube Studio → Content (or your channel’s Videos tab), sorted newest first.'
      : platform === 'tiktok'
      ? 'Open TikTok Studio → Posts (or your profile grid), newest first.'
      : platform === 'instagram'
      ? 'Open your Instagram profile and look at your posts/reels grid, newest first.'
      : 'Open your profile / content page where your posts are listed with their dates, newest first.'
  return `${READ_ONLY}

${where}

Read the PUBLISH DATE of each of my most recent posts${w} — go back as far as you can see (aim for the last ~30 posts, or about 90 days). If a date is relative ("2 days ago", "yesterday", "last week"), convert it to an absolute calendar date using today's date.

Reply with ONLY this block — one ISO date per line, newest first, nothing else:

===POSTDATES===
YYYY-MM-DD
YYYY-MM-DD

If you can't see any post dates, reply with only the marker line and then "n/a".`
}

/**
 * Pull `YYYY-MM-DD` dates out of a post-dates reply. Tolerant of the marker
 * line, bullets, and stray prose — just harvests every ISO date it finds,
 * dedupes, and returns them newest-first.
 */
export function parsePostDates(text: string): string[] {
  const found = text.match(/\d{4}-\d{2}-\d{2}/g) ?? []
  const valid = found.filter(d => Number.isFinite(Date.parse(d)) && d >= '2000-01-01')
  return Array.from(new Set(valid)).sort((a, b) => (a < b ? 1 : -1))
}

/** A short instruction shown above the prompt box telling the user the loop. */
export const EXTENSION_HOWTO =
  'Copy this, open your analytics page in Chrome, then paste it into the Claude Chrome extension. Paste whatever it gives back into the box below.'

// -----------------------------------------------------------------------------
// MASTER prompt — one pull that returns EVERYTHING.
//
// The pack prompts below pull one thing at a time. The master prompt pulls all
// of it in a single Claude-extension run and returns === delimited sections that
// `parseMasterReply` routes to each data pack — so one paste fills every feature
// button on the brand page (and gives the playbook every input it needs). Keep
// MASTER_TAGS in sync with both the prompt text and the routing table in
// SocialCommandCenter.tsx.
// -----------------------------------------------------------------------------

export const MASTER_TAGS = [
  'NUMBERS', 'WORKING', 'AUDIENCE', 'TIMES', 'COMMENTS', 'DMS', 'NICHE', 'DESCRIPTION',
  // YouTube-only sections — only emitted into the prompt for youtube accounts.
  'TOPFLOP', 'RETENTION',
] as const
export type MasterTag = (typeof MASTER_TAGS)[number]

export function buildMasterPrompt(platform: SocialPlatform, handle?: string): string {
  const w = handle ? ` for ${handle}` : ''
  return `${READ_ONLY}

${WHERE[platform]}

One job: read EVERYTHING available about my ${platform} account${w} and report it in the EXACT sections below. Where a section needs it, also open my recent posts and their comments. Set every date range to the LAST 28 DAYS. Use ONLY what is visible on screen — never guess; write "n/a" for anything not shown.

Reply with these sections IN THIS ORDER. Each section MUST start with its marker line written exactly as shown (=== on both sides, alone on its own line). Put nothing before the first marker and nothing after the last section.

===NUMBERS===
PLATFORM: ${platform}
PERIOD: last 28 days
FOLLOWERS: <total follower/subscriber count, plain digits — no K/M, no commas>
VIEWS: <views or impressions>
REACH: <accounts reached / unique viewers>
NON_FOLLOWER_PCT: <% of views from non-followers>
LIKES: <total likes>
COMMENTS: <total comments>
SAVES: <total saves / bookmarks>
SHARES: <total shares>
FOLLOWS: <new follows in the period>
ENGAGEMENT_RATE: <engagement rate % if shown>

===WORKING===
Look at my last ~20 posts. Pick the 3 best by views. For each: the hook / first line, topic, length, day + time posted, format, and any hashtags. Then in plain language: the ONE pattern across the winners, what's flopping and why, and my exact next post (topic, hook, length, best time, 3 hashtags).

===AUDIENCE===
Who follows me and what they care about, in plain language, plus 3 content angles that would land with them. Then the age ranges with their %, the gender split, and my top countries + cities with their %, exactly as shown.

===TIMES===
The 2–3 best windows to post (day + time) based on when my followers are most active. Then turn that into a concrete weekly posting schedule I can follow.

===COMMENTS===
From my recent posts' comments (top + recent): the 3 themes people keep raising, the questions they ask most, and 5 post ideas that answer them directly. Quote 2 real comments verbatim.

===DMS===
If my DMs / messages are visible, the recurring themes and questions in them. If DMs aren't visible, write "n/a".

===NICHE===
In one short paragraph: the niche my content sits in, exactly who it's for, and how I'm positioned versus similar accounts — using only what is visible.

===DESCRIPTION===
Open my recent videos / posts and read their full descriptions / captions. Find what REPEATS across them — the evergreen boilerplate I reuse every time: who I am, what the channel / brand is, any sponsor or affiliate line, my standard links, and my usual call-to-action. Output ONLY that reusable BASE description — no per-video specifics, no timestamps, no hashtags — ready to paste as my default description. If there's nothing reusable, write "n/a".
${platform === 'youtube' ? `
===TOPFLOP===
Sort my videos by views (last 90 days). List my 3 BEST and 3 WORST videos — for each: title, views, average view duration / % viewed, and click-through rate (CTR) if shown. Then in plain language: what the winners share (title, thumbnail, topic, length, hook), what the flops share (what to stop), and the exact next video to make.

===RETENTION===
From Audience + Reach (last 28 days): average view duration and % viewed, where viewers drop off (intro / mid / end) from the retention curve, and my top traffic sources (browse / suggested / search / external) with their % share + the top search terms or suggested videos bringing views if shown. Then one fix to improve retention and one to get more reach.
` : ''}
End after the last section.`
}

/**
 * Split a master-prompt reply into its sections. Tolerant of stray prose around
 * the markers; returns only sections with real content (a bare "n/a" or empty
 * body is dropped so a partial paste never overwrites a real saved read).
 */
export function parseMasterReply(text: string): Partial<Record<MasterTag, string>> {
  const out: Partial<Record<MasterTag, string>> = {}
  const marker = /^===\s*([A-Z_]+)\s*===$/
  let cur: MasterTag | null = null
  let buf: string[] = []
  const flush = () => {
    if (cur) {
      const body = buf.join('\n').trim()
      if (body && body.toLowerCase() !== 'n/a') out[cur] = body
    }
    buf = []
  }
  for (const raw of text.split('\n')) {
    const m = marker.exec(raw.trim())
    if (m && (MASTER_TAGS as readonly string[]).includes(m[1])) {
      flush()
      cur = m[1] as MasterTag
    } else if (cur) {
      buf.push(raw)
    }
  }
  flush()
  return out
}

// -----------------------------------------------------------------------------
// Prompt packs — one tailored READ-ONLY prompt per use-case. The user picks a
// pack, clicks "Open + Copy" on a logged channel (opens that platform's
// analytics page + copies the prompt), runs it in the Claude Chrome extension,
// and reads the answer there. Only the `numbers` pack is meant to be pasted
// back into the app (its reply is the strict KEY:value block our parser saves).
// -----------------------------------------------------------------------------

/**
 * Best analytics entry-point URL per platform, opened alongside the copied
 * prompt. YouTube/TikTok have stable studio URLs; Instagram insights aren't
 * deep-linkable, so we open the profile and the user taps into Insights.
 */
export function analyticsUrl(platform: SocialPlatform, handle?: string): string {
  const h = (handle ?? '').replace(/^@/, '').trim()
  switch (platform) {
    case 'youtube':   return 'https://studio.youtube.com/'
    case 'tiktok':    return 'https://www.tiktok.com/tiktokstudio/analytics'
    case 'instagram': return h ? `https://www.instagram.com/${encodeURIComponent(h)}/` : 'https://www.instagram.com/'
    default:          return ''
  }
}

export type PromptPackId =
  | 'numbers' | 'whatsworking' | 'audience' | 'demographics'
  | 'locations' | 'besttimes' | 'comments'
  | 'topflop' | 'retention'

export interface PromptPack {
  id: PromptPackId
  label: string
  blurb: string
  /**
   * true  → the reply is the strict KEY:value block; paste it back to update
   *         your charts. false → a plain-language read you keep in the extension.
   */
  saves: boolean
  build: (platform: SocialPlatform, handle?: string) => string
}

function who(handle?: string): string {
  return handle ? ` for ${handle}` : ''
}

export const PROMPT_PACKS: PromptPack[] = [
  {
    id: 'numbers',
    label: 'Update numbers',
    blurb: 'Pulls all your account numbers and saves them to your charts, plus a quick read on how you stack up against a typical account your size.',
    saves: true,
    build: (platform, handle) => `${buildExtensionPrompt(platform, handle)}

After the block, write a line with only --- and then in 3 short bullets tell me how these numbers compare to a typical ${platform} account my size (engagement, growth, reach). Plain language.`,
  },
  {
    id: 'whatsworking',
    label: "What's working",
    blurb: 'Reads your recent posts, finds the top performers, and extracts WHY — hook, topic, length, timing, hashtags — then tells you exactly what to make next.',
    saves: false,
    build: (platform, handle) => `${READ_ONLY}

Open my ${platform} content/analytics${who(handle)} and look at my last ~20 posts (reels / videos / shorts). Use the views and engagement shown on screen.

Find the 3 best-performing posts. For each, note: the hook / first line, the topic, the length, the day + time posted, the format, and any hashtags shown.

Then in plain language tell me:
1. The ONE pattern working across the winners.
2. What's flopping, and why.
3. My exact next video: topic, hook, length, best post time, 3 hashtags.

Be specific. Don't guess at numbers that aren't shown.`,
  },
  {
    id: 'audience',
    label: 'Audience',
    blurb: 'A plain-language read of who actually follows you and what they want.',
    saves: false,
    build: (platform, handle) => `${READ_ONLY}

Open my ${platform} audience/followers analytics${who(handle)}. Read what's shown about who follows me.

Tell me in plain language: who my audience is, what they care about, and 3 content angles that would land with them. Only use what's on screen; write "n/a" for anything not shown.`,
  },
  {
    id: 'demographics',
    label: 'Age & gender',
    blurb: 'The age ranges and gender split of your followers.',
    saves: false,
    build: (platform, handle) => `${READ_ONLY}

Open my ${platform} audience analytics${who(handle)} and read the age + gender breakdown of my followers.

Report each age range with its %, and the gender split, exactly as shown. Then one sentence on what that means for the content I should make. Write "n/a" for anything not shown.`,
  },
  {
    id: 'locations',
    label: 'Top locations',
    blurb: 'The countries and cities most of your audience is in.',
    saves: false,
    build: (platform, handle) => `${READ_ONLY}

Open my ${platform} audience analytics${who(handle)} and read the top locations of my followers.

List my top countries and top cities with their % as shown. Then one line on the best time zone to post for them. Write "n/a" for anything not shown.`,
  },
  {
    id: 'besttimes',
    label: 'Best times',
    blurb: 'When your followers are online — the best days and times to post.',
    saves: false,
    build: (platform, handle) => `${READ_ONLY}

Open my ${platform} analytics${who(handle)} and read when my followers are most active (most active times / days).

Give me the best 2–3 windows to post (day + time), straight from what's shown. If only a chart is shown, read its peaks. Write "n/a" if it isn't available.`,
  },
  {
    id: 'comments',
    label: 'Comments',
    blurb: 'Reads your recent comments for themes and questions, and turns them into video ideas.',
    saves: false,
    build: (platform, handle) => `${READ_ONLY}

Open my most recent ${platform} posts${who(handle)} and read the comments (top + recent).

Tell me: the 3 themes people keep raising, the questions they ask most, and 5 video ideas that answer them directly. Quote a couple of real comments. Only use comments that are actually visible.`,
  },
  {
    id: 'topflop',
    label: 'Best & worst videos',
    blurb: 'Ranks your best and worst videos and explains why each won or flopped — so you know what to repeat and what to drop.',
    saves: false,
    build: (platform, handle) => `${READ_ONLY}

Open my ${platform} content analytics${who(handle)} (e.g. YouTube Studio → Content / Analytics). Sort my videos by views over the last 90 days.

List my 3 BEST videos and my 3 WORST videos. For each: the title, views, average view duration / % viewed, and click-through rate (CTR) if shown.

Then in plain language:
1. What the winners share — title style, thumbnail, topic, length, hook.
2. What the flops share — what to stop doing.
3. The exact next video to make based on the winners.

Use only what's on screen; write "n/a" for anything not shown.`,
  },
  {
    id: 'retention',
    label: 'Retention & traffic',
    blurb: 'Where viewers drop off and how they find you — so you can fix your intros and lean into what brings the most views.',
    saves: false,
    build: (platform, handle) => `${READ_ONLY}

Open my ${platform} analytics${who(handle)} (e.g. YouTube Studio → Analytics → Audience + Reach) for the last 28 days.

Report:
1. Average view duration and average percentage viewed.
2. Where viewers typically drop off (intro / mid / end) — read the retention curve if shown.
3. My top traffic sources (browse / suggested / search / external) with their % share.
4. The top search terms / suggested videos bringing me views, if shown.

Then two plain-language fixes: one to improve retention, one to get more reach from my best traffic source. Use only what's on screen; write "n/a" for anything not shown.`,
  },
]
