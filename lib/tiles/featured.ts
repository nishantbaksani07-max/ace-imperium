import type { TileEnvelope, ReportKind } from './types'
import featuredHtml from './featuredHtml.json'

/**
 * The Arts District catalog (Pillar 3): a curated gallery of ready-made tiles a
 * user adds in one tap, no Claude needed. Each entry wraps the SAME install
 * envelope every pillar shares (handed to tileStore.importTile) with the shop's
 * display copy. New drops are appended here; Alex + Sam curate weekly.
 *
 * The sealed tile HTML lives in featuredHtml.json (one big blob per id) so this
 * file stays a readable catalog and the htmls never need escaping. Adding a tile
 * to the shop = one JSON entry + one row here.
 */
export interface FeaturedTile {
  /** Stable shop id. NOT the per-user tile id (that is minted fresh on install). */
  id: string
  /** One-line pitch shown on the card. */
  tagline: string
  /** Who made it. 'Vitality' for first-party drops. */
  author: string
  /** Card accent hex. Mint by default; gold / iris give a tile its own character. */
  accent: string
  /** This week's highlighted drop (a small "New" flag on the card). */
  fresh?: boolean
  /** Hidden from public surfaces; founders see + install it (dogfood phase). */
  founderOnly?: boolean
  /** The install envelope handed to tileStore.importTile on Add: the tile's name,
   *  sealed html, display category, poster design, report kind, and skin tint. */
  envelope: TileEnvelope
  /** The detail-modal pitch + curated sample week (DistrictDetailModal). */
  preview: TilePreview
}

/**
 * One honest, representative "good week" of sample data for the detail-modal
 * showcase (the left column of DistrictDetailModal, approved in
 * public/district-detail-modal.html). Four shapes, one per way a tile reports:
 *
 *  - ring:    intake / count / duration. A mint goal ring that draws in, a big
 *             serif number that counts up, 7 staggered day bars, a streak line.
 *  - week:    done. A big streak count + a 7-box week grid.
 *  - scale:   rating. A big value + a small filled dot scale.
 *  - journal: the text tile. A few quiet sample lines, never a fake numeric chart.
 */
export type TileShowcase =
  | {
      variant: 'ring'
      /** Today's headline value (counts up in the big serif number). */
      value: number
      /** The daily goal the ring draws toward. */
      goal: number
      /** The small line under the number ("2 to go today"). */
      sub: string
      /** Seven day values, Monday first, today last. Bars scale to the max. */
      chart: number[]
      streak: number
      best: number
    }
  | {
      variant: 'week'
      /** Seven done/missed flags, Monday first. */
      week: (0 | 1)[]
      streak: number
      best: number
      /** The kept-days fraction shown in the streak line ("6 of 7"). */
      kept: string
    }
  | {
      variant: 'scale'
      /** Today's rating (counts up), out of `outOf`, drawn as filled dots. */
      value: number
      outOf: number
      /** The small line under the number ("of 5 today"). */
      sub: string
      streak: number
      best: number
    }
  | {
      variant: 'journal'
      /** A few sample entries: a mono day letter + one short serif line each. */
      lines: { day: string; text: string }[]
      streak: number
      best: number
    }

/** The curated detail-modal copy for one featured tile: ONE short summary line,
 *  exactly three small pill tags, and the showcase sample week above. Minimal on
 *  purpose; the modal never shows paragraphs. */
export interface TilePreview {
  summary: string
  tags: [string, string, string]
  showcase: TileShowcase
}

const HTML = featuredHtml as Record<string, string>

const MINT = '#6EE7B7'
const GOLD = '#e8c878'
const IRIS = '#b9a3ff'

/**
 * The build recipe that regenerates a numeric featured tile from the deterministic
 * MCP builder (mcp/src/tiles: infer + renderTile). This is the tile's single source
 * of identity; scripts/genFeatured.ts turns it into the sealed html in
 * featuredHtml.json, and __tests__/featuredTiles.test.ts asserts the committed html
 * never drifts from `renderTile(infer(build))`. Only NUMERIC tiles carry a recipe;
 * `one-line-journal` is text, not a number, so it stays hand-authored (the one
 * documented exception, excluded from codegen).
 */
export interface BuildRecipe {
  /** Plain-English goal handed to infer() (drives fallbacks; explicit fields win). */
  goal: string
  /** The report kind, pinned (never left to inference for a curated tile). */
  kind: ReportKind
  /** The tile name / hero label. */
  name: string
  /** Explicit unit so the tile never depends on goal-text parsing. */
  unit?: string
  goalDirection?: 'up' | 'down' | 'neutral'
  /** For rating tiles: the top of the scale (5 or 10). */
  scaleMax?: number
  /** The daily/session goal a counting tile aims at (draws the progress ring). */
  target?: number
  /** The report stream key, kept BYTE-IDENTICAL to the tile's shipped key so no
   *  user's Vee stream re-keys when the html is regenerated. (infer() singularizes,
   *  e.g. "steps"->"step", "focus"->"focu", so we pin the key explicitly.) */
  key: string
}

/** The flat catalog definition. Kept separate from FEATURED_TILES so the heavy
 *  html is pulled from the json by id and the rest reads as a clean table. */
export interface Def {
  id: string
  name: string
  tagline: string
  accent: string
  category: string
  kind: ReportKind
  design: string
  fresh?: boolean
  preview: TilePreview
  /** Present on the 10 numeric tiles; absent on one-line-journal (hand-authored). */
  build?: BuildRecipe
  fullPage?: boolean
  /** Dogfood gate: compiled in and fully functional, but hidden from every
   *  public surface (Arts District, /district, sitemap) unless the viewer is
   *  a founder. Flip off to launch the tile for everyone. */
  founderOnly?: boolean
}

export const DEFS: Def[] = [
  {
    id: 'water-daily',
    name: 'Water',
    tagline: 'Tap a glass. It resets fresh each morning.',
    accent: MINT,
    category: 'Intake',
    kind: 'intake',
    design: 'tide-layers',
    fresh: true,
    build: { goal: 'glasses of water a day', kind: 'intake', name: 'Water', unit: 'glasses', goalDirection: 'up', target: 8, key: 'water' },
    preview: {
      summary: 'Tap a glass. It remembers your week.',
      tags: ['7-day chart', 'streak', 'feeds Vee'],
      showcase: {
        variant: 'ring',
        value: 6,
        goal: 8,
        sub: '2 to go today',
        chart: [8, 5, 8, 6, 8, 8, 6],
        streak: 2,
        best: 6,
      },
    },
  },
  {
    id: 'habit-streak',
    name: 'Habit',
    tagline: 'One habit, one tap, a streak you protect.',
    accent: MINT,
    category: 'Done',
    kind: 'done',
    design: 'effort-ring',
    fresh: true,
    build: { goal: 'daily habit', kind: 'done', name: 'Habit', key: 'habit' },
    preview: {
      summary: 'One tap a day. A streak you protect.',
      tags: ['week grid', 'streak', 'feeds Vee'],
      showcase: { variant: 'week', week: [1, 1, 1, 0, 1, 1, 1], streak: 3, best: 9, kept: '6 of 7' },
    },
  },
  {
    id: 'one-line-journal',
    name: 'One line a day',
    tagline: 'A single honest line about today.',
    accent: IRIS,
    category: 'Count',
    kind: 'count',
    design: 'journal-lines',
    preview: {
      summary: 'One honest line, thirty seconds a day.',
      tags: ['one line', 'private', 'feeds Vee'],
      showcase: {
        variant: 'journal',
        lines: [
          { day: 'F', text: 'Long walk after work. Head finally quiet.' },
          { day: 'S', text: 'Shipped the thing. Slept like a rock.' },
          { day: 'S', text: 'Slow morning, coffee, one good chapter.' },
        ],
        streak: 3,
        best: 8,
      },
    },
  },
  {
    id: 'mood-check',
    name: 'Mood',
    tagline: 'A daily check in, no words needed.',
    accent: GOLD,
    category: 'Rating',
    kind: 'rating',
    design: 'mood-wave',
    build: { goal: 'rate my mood', kind: 'rating', name: 'Mood', scaleMax: 5, key: 'mood' },
    preview: {
      summary: 'How today felt, in one quiet tap.',
      tags: ['1 to 5', 'daily check', 'feeds Vee'],
      showcase: { variant: 'scale', value: 4, outOf: 5, sub: 'of 5 today', streak: 7, best: 16 },
    },
  },
  {
    id: 'focus-timer',
    name: 'Focus',
    tagline: 'Twenty five quiet minutes, counted.',
    accent: MINT,
    category: 'Duration',
    kind: 'duration',
    design: 'focus-orbit',
    build: { goal: 'focus minutes', kind: 'duration', name: 'Focus', unit: 'min', goalDirection: 'up', target: 25, key: 'focus' },
    preview: {
      summary: 'Deep work minutes, counted and kept.',
      tags: ['7-day chart', 'streak', 'feeds Vee'],
      showcase: {
        variant: 'ring',
        value: 75,
        goal: 100,
        sub: '3 sessions in',
        chart: [50, 25, 75, 50, 100, 75, 75],
        streak: 3,
        best: 5,
      },
    },
  },
  {
    id: 'sleep-hours',
    name: 'Sleep',
    tagline: 'How long you slept, held to eight hours.',
    accent: GOLD,
    category: 'Duration',
    kind: 'duration',
    design: 'crescent-rest',
    fresh: true,
    build: { goal: 'hours of sleep', kind: 'duration', name: 'Sleep', unit: 'h', target: 8, key: 'sleep' },
    preview: {
      summary: 'Last night, held against eight hours.',
      tags: ['8h target', '7-day chart', 'feeds Vee'],
      showcase: {
        variant: 'ring',
        value: 7.5,
        goal: 8,
        sub: 'hours last night',
        chart: [7, 6.5, 8, 7, 7.5, 8, 7.5],
        streak: 4,
        best: 9,
      },
    },
  },
  {
    id: 'daily-steps',
    name: 'Steps',
    tagline: 'Add your walks, climb toward the day goal.',
    accent: MINT,
    category: 'Count',
    kind: 'count',
    design: 'ridge-climb',
    build: { goal: 'daily steps', kind: 'count', name: 'Steps', unit: 'steps', goalDirection: 'up', target: 10000, key: 'steps' },
    preview: {
      summary: 'Every walk banked toward ten thousand.',
      tags: ['10k goal', '7-day chart', 'feeds Vee'],
      showcase: {
        variant: 'ring',
        value: 8400,
        goal: 10000,
        sub: 'of 10,000 today',
        chart: [9100, 6200, 10400, 8000, 11200, 9600, 8400],
        streak: 3,
        best: 7,
      },
    },
  },
  {
    id: 'protein-grams',
    name: 'Protein',
    tagline: 'Log grams, close in on your daily target.',
    accent: MINT,
    category: 'Intake',
    kind: 'intake',
    design: 'rep-bars',
    build: { goal: 'protein grams', kind: 'intake', name: 'Protein', unit: 'g', goalDirection: 'up', target: 150, key: 'protein' },
    preview: {
      summary: 'Grams in, the daily target closing.',
      tags: ['180 g target', '7-day chart', 'feeds Vee'],
      showcase: {
        variant: 'ring',
        value: 152,
        goal: 180,
        sub: 'of 180 g today',
        chart: [170, 150, 180, 140, 180, 165, 152],
        streak: 3,
        best: 8,
      },
    },
  },
  {
    id: 'reading-minutes',
    name: 'Reading',
    tagline: 'A few pages a day, counted in minutes.',
    accent: IRIS,
    category: 'Duration',
    kind: 'duration',
    design: 'journal-lines',
    build: { goal: 'reading minutes', kind: 'duration', name: 'Reading', unit: 'min', goalDirection: 'up', target: 20, key: 'reading' },
    preview: {
      summary: 'Minutes read, one chapter at a time.',
      tags: ['30 min goal', 'streak', 'feeds Vee'],
      showcase: {
        variant: 'ring',
        value: 22,
        goal: 30,
        sub: 'of 30 min today',
        chart: [25, 10, 30, 20, 30, 25, 22],
        streak: 4,
        best: 11,
      },
    },
  },
  {
    id: 'pushups-daily',
    name: 'Pushups',
    tagline: 'Bank a set at a time toward fifty.',
    accent: MINT,
    category: 'Count',
    kind: 'count',
    design: 'effort-ring',
    build: { goal: 'pushups a day', kind: 'count', name: 'Pushups', unit: 'pushups', goalDirection: 'up', target: 50, key: 'pushup' },
    preview: {
      summary: 'Sets banked through the day, toward fifty.',
      tags: ['50 a day', '7-day chart', 'feeds Vee'],
      showcase: {
        variant: 'ring',
        value: 40,
        goal: 50,
        sub: 'of 50 today',
        chart: [50, 30, 50, 35, 50, 45, 40],
        streak: 2,
        best: 12,
      },
    },
  },
  {
    id: 'stretch-done',
    name: 'Stretch',
    tagline: 'A daily mobility check, one honest tap.',
    accent: MINT,
    category: 'Done',
    kind: 'done',
    design: 'recovery-rings',
    build: { goal: 'stretch done', kind: 'done', name: 'Stretch', key: 'stretch' },
    preview: {
      summary: 'One honest tap after you stretch.',
      tags: ['week grid', 'streak', 'feeds Vee'],
      showcase: { variant: 'week', week: [1, 0, 1, 1, 1, 1, 1], streak: 5, best: 9, kept: '6 of 7' },
    },
  },
  {
    id: 'studio',
    name: 'Studio',
    tagline: 'Every video, one card. Script, title, tags, links, all in one place.',
    accent: '#9be7b8',
    category: 'Create',
    kind: 'count',
    design: 'studio-spark',
    fresh: true,
    fullPage: true,
    founderOnly: true,
    preview: {
      summary: 'Every video, packaged and remembered in one card.',
      tags: ['scripts', 'titles', 'one card'],
      showcase: {
        variant: 'ring',
        value: 3,
        goal: 4,
        sub: '1 to go this week',
        chart: [1, 0, 1, 1, 0, 1, 0],
        streak: 3,
        best: 5,
      },
    },
  },
]

export const FEATURED_TILES: FeaturedTile[] = DEFS.map((d) => ({
  id: d.id,
  tagline: d.tagline,
  author: 'Vitality',
  accent: d.accent,
  fresh: d.fresh,
  preview: d.preview,
  founderOnly: d.founderOnly,
  envelope: {
    name: d.name,
    html: HTML[d.id] ?? '',
    category: d.category,
    kind: d.kind,
    design: d.design,
    color: d.accent === MINT ? undefined : d.accent,
    ...(d.fullPage ? { fullPage: true } : {}),
  },
}))

/** The catalog with founder-only dogfood tiles removed: what every PUBLIC
 *  surface (the /district shop, its detail/OG pages, the sitemap) must list.
 *  In-app, ArtsDistrict filters per-viewer instead so founders still see them. */
export const PUBLIC_FEATURED_TILES: FeaturedTile[] = FEATURED_TILES.filter((t) => !t.founderOnly)

/** The categories present in the catalog, in first-seen order, for the shop's
 *  filter chips. 'All' is prepended by the gallery. */
export const FEATURED_CATEGORIES: string[] = Array.from(
  new Set(DEFS.map((d) => d.category)),
)

/**
 * First-party tiles allowed to use the host's gated AI verbs ('ai',
 * 'studio:lookup', 'studio:status', 'studio:connect' in useTileHost).
 *
 * The trust decision is HTML BYTE-EQUALITY against the canonical featured
 * blob compiled into this bundle, checked by the host at register() time.
 * This is deliberately stronger than any marker stored on the tile record:
 * markers (an origin field, a featuredId) live in user-editable storage and
 * don't survive the tiles-table round-trip, so they can be forged onto
 * arbitrary malicious HTML. Byte-equality cannot: the only way to pass is to
 * BE our unmodified tile, which is harmless by definition (same code, same
 * endpoints, same per-user auth + daily cap server-side). A single changed
 * byte (an injected script, a tweaked handler) fails the check and the tile
 * silently loses the gated verbs while everything else keeps working.
 *
 * When a first-party AI tile's blob is updated, append the OLD html to
 * LEGACY_AI_HTML so already-installed copies keep their AI until the user
 * re-adds the new version from the Arts District.
 */
const FIRST_PARTY_AI_IDS = ['studio'] as const

/** Prior published blobs of first-party AI tiles (upgrade grace). */
const LEGACY_AI_HTML: string[] = []

const FIRST_PARTY_AI_HTML: ReadonlySet<string> = new Set([
  ...FIRST_PARTY_AI_IDS.map((id) => HTML[id] ?? '').filter((h) => h.length > 0),
  ...LEGACY_AI_HTML,
])

/** True iff this exact html IS one of our first-party AI tiles, byte for byte. */
export function isFirstPartyAiHtml(html: string | undefined | null): boolean {
  return typeof html === 'string' && html.length > 0 && FIRST_PARTY_AI_HTML.has(html)
}

/**
 * A curated bundle of featured tiles. Collections are a hand-picked, themed view
 * over the SAME FEATURED_TILES (a tile may live in more than one set) so the
 * gallery reads as curated rather than a flat wall. Alex + Sam edit these; a
 * collection never installs its own HTML, it only references existing shop ids. */
export interface FeaturedCollection {
  /** Stable collection id. */
  id: string
  /** Short editorial name shown on the group. */
  title: string
  /** One calm line on what this set is for. */
  blurb: string
  /** Featured tile ids, in display order. Each must exist in FEATURED_TILES. */
  tileIds: string[]
}

/** The curated collections, in display order. Only references ids present in
 *  DEFS above; keep in sync when a tile is renamed or removed (tilesForCollection
 *  quietly drops any id that no longer resolves). */
export const FEATURED_COLLECTIONS: FeaturedCollection[] = [
  {
    id: 'morning-routine',
    title: 'Morning routine',
    blurb: 'The quiet first hour. Water, a stretch, one honest line to start.',
    tileIds: ['water-daily', 'stretch-done', 'one-line-journal', 'mood-check'],
  },
  {
    id: 'cutting-stack',
    title: 'Cutting stack',
    blurb: 'The dials that move a cut. Protein up, steps up, sleep held.',
    tileIds: ['protein-grams', 'daily-steps', 'water-daily', 'sleep-hours'],
  },
  {
    id: 'deep-work',
    title: 'Deep work',
    blurb: 'Guard the focus. Quiet minutes, pages read, a habit you protect.',
    tileIds: ['focus-timer', 'reading-minutes', 'habit-streak'],
  },
  {
    id: 'strong-body',
    title: 'Strong body',
    blurb: 'Small daily reps that stack up. Pushups, protein, mobility.',
    tileIds: ['pushups-daily', 'protein-grams', 'stretch-done', 'daily-steps'],
  },
]

/** Pure resolver: the FeaturedTile[] for a collection id, in the collection's
 *  own order, skipping any tile id that no longer exists in the catalog. Returns
 *  [] for an unknown collection. */
export function tilesForCollection(id: string): FeaturedTile[] {
  const collection = FEATURED_COLLECTIONS.find((c) => c.id === id)
  if (!collection) return []
  const byId = new Map(FEATURED_TILES.map((t) => [t.id, t]))
  return collection.tileIds
    .map((tid) => byId.get(tid))
    .filter((t): t is FeaturedTile => t !== undefined)
}
