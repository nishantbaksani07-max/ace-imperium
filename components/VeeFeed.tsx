'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './veeFeed.module.css'

/* Vee's read on your life — the feed-first Vee surface (Vitality Noticed).
 * Ported 1:1 from public/vee-showcase.html. Iris/purple + mint + amber palette,
 * a rarity collection grid, a rarity-graded insight feed with a detailed/simple
 * toggle, the climb signal graph, and the engine ladder.
 *
 * The five example finds live in CARDS below as a typed VeeInsight[] so real
 * data can replace them later without touching the view. */

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'
type ChipTone = 'm' | 'a' | ''
type IconKey =
  | 'echo' | 'clock' | 'minus' | 'check' | 'up' | 'pulse'
  | 'arrow' | 'drop' | 'moon' | 'star'

interface VeeChip { tone: ChipTone; icon: IconKey; text: string }

interface VeeInsight {
  rarity: Rarity
  watched: string
  timeframe: string
  /** HTML string — keeps the mint (.km/.key) + amber (.ka) inline emphasis. */
  detailed: string
  simple: string
  goals: string[]
  chips: VeeChip[]
  primary: string
}

/* ---------- icons (all SVG, no emoji) ---------- */
const IC: Record<IconKey, ReactNode> = {
  echo: <path d="M5 7l7 11 7-11" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>,
  minus: <path d="M5 12h14" />,
  check: <path d="M20 6L9 17l-5-5" />,
  up: <path d="M3 17l6-6 4 4 8-8" />,
  pulse: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  arrow: <path d="M5 12h14M12 5l7 7-7 7" />,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  moon: <path d="M21 12.5A8.5 8.5 0 1 1 11.5 3 7 7 0 0 0 21 12.5z" />,
  star: <path d="M12 2l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9z" />,
}
function Ic({ name, sw = 2 }: { name: IconKey; sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {IC[name]}
    </svg>
  )
}

/* ---------- the five finds ---------- */
const CARDS: VeeInsight[] = [
  {
    rarity: 'uncommon', watched: 'caffeine + recovery', timeframe: '30d',
    detailed: 'your recovery runs <span class="key">lower the mornings after your heavier caffeine days</span>. after your higher-caffeine days (about <span class="ka">340 mg</span>) your next-morning recovery averaged <span class="ka">58%</span>, after your lighter ones (about 150 mg) it was <span class="km">71%</span>. ease off the late, heavy hits and your mornings bounce back.',
    simple: 'big caffeine days, slower mornings. lighter days, you bounce back. <span class="key">ease off the late, heavy hits.</span>',
    goals: ['train harder', 'feel recovered'],
    chips: [
      { tone: 'a', icon: 'minus', text: '340 mg days · 58% recovery' },
      { tone: 'm', icon: 'check', text: '150 mg days · 71% recovery' },
      { tone: '', icon: 'clock', text: '14 paired mornings' },
    ],
    primary: 'keep it before 2pm',
  },
  {
    rarity: 'rare', watched: 'sleep + training volume', timeframe: '8wk',
    detailed: 'on the nights you slept under <span class="ka">6 hours</span>, your next session quietly lost <span class="ka">~18% volume</span>, you cut a set without noticing. your <span class="km">7h+</span> nights held full volume across 22 sessions. <span class="key">sleep is buying you the extra set.</span>',
    simple: 'short sleep, lighter workout the next day. <span class="key">a full night buys you a whole extra set.</span>',
    goals: ['build muscle', 'stay consistent'],
    chips: [
      { tone: 'a', icon: 'moon', text: 'under 6h · −18% volume' },
      { tone: 'm', icon: 'check', text: '7h+ · full volume' },
      { tone: '', icon: 'pulse', text: '22 sessions paired' },
    ],
    primary: 'protect a 7h window',
  },
  {
    rarity: 'epic', watched: 'water + energy + snacking', timeframe: '6wk',
    detailed: 'three threads, one habit. the afternoons you passed <span class="km">2L of water by 3pm</span>, your 4pm energy dip <span class="km">vanished</span> and evening snacking fell <span class="km">30%</span>. under <span class="ka">1.2L</span>, the crash and the late fridge trips both showed up. <span class="key">front-load your water and two problems disappear at once.</span>',
    simple: 'hit your water early and the afternoon crash and the night snacking both go away. <span class="key">it is one habit fixing three things.</span>',
    goals: ['get lean', 'feel on top'],
    chips: [
      { tone: 'm', icon: 'drop', text: '2L by 3pm · no crash' },
      { tone: 'm', icon: 'check', text: '−30% night snacking' },
      { tone: 'a', icon: 'minus', text: 'under 1.2L · both return' },
    ],
    primary: 'set a 3pm water target',
  },
  {
    rarity: 'legendary', watched: 'money + training + mood', timeframe: '6wk',
    detailed: 'your <span class="ka">spending climbs</span> the weeks your <span class="ka">training drops</span>, and both spike when work stress does. it is one spiral, not three problems. the weeks you trained three times, spending fell <span class="km">40%</span> and your mood held. training is the lever, so <span class="key">protect three sessions</span>.',
    simple: 'train 3x in a week and your spending and your mood both hold. skip it and all three slide together. <span class="key">the gym is the lever.</span>',
    goals: ['get lean', 'launch the business', 'feel on top'],
    chips: [
      { tone: 'a', icon: 'up', text: 'spend +$210 low-train weeks' },
      { tone: 'm', icon: 'check', text: '−40% when 3+ sessions' },
      { tone: 'm', icon: 'pulse', text: 'mood held' },
    ],
    primary: 'protect 3 sessions',
  },
  {
    rarity: 'mythic', watched: 'your whole record', timeframe: '8mo',
    detailed: 'across eight months, every stretch you strung <span class="km">three trained weeks back to back</span>, everything else followed: you shipped more, spent less, slept deeper, and your <span class="km">mood floor rose</span>. it was never motivation or willpower. <span class="key">consistency in the gym is the single lever your whole life hangs on.</span> guard the streak above everything else and the rest takes care of itself.',
    simple: 'your gym streak is the one thing that pulls everything else up. money, sleep, work, mood, all of it follows. <span class="key">protect the streak first and the rest sorts itself out.</span>',
    goals: ['every goal you have'],
    chips: [
      { tone: 'm', icon: 'star', text: '3-week streaks · everything rises' },
      { tone: 'm', icon: 'check', text: 'shipped more · spent less' },
      { tone: 'm', icon: 'pulse', text: 'mood floor · up all 8 months' },
    ],
    primary: 'guard the streak',
  },
]

/* ---------- the rarity collection ---------- */
const RARITIES: { rarity: Rarity; name: string; count: number; mean: string; cur?: boolean }[] = [
  { rarity: 'common', name: 'common', count: 23, mean: 'a small true nudge' },
  { rarity: 'uncommon', name: 'uncommon', count: 11, mean: 'a solid single link' },
  { rarity: 'rare', name: 'rare', count: 8, mean: 'a link you would miss' },
  { rarity: 'epic', name: 'epic', count: 4, mean: 'two or three, one story' },
  { rarity: 'legendary', name: 'legendary', count: 2, mean: 'the lever for a big goal' },
  { rarity: 'mythic', name: 'mythic', count: 1, mean: 'the one you would kill to know', cur: true },
]

const rClass: Record<Rarity, string> = {
  common: styles.rCommon, uncommon: styles.rUncommon, rare: styles.rRare,
  epic: styles.rEpic, legendary: styles.rLegendary, mythic: styles.rMythic,
}
const rarClass: Record<Rarity, string> = {
  common: '', uncommon: '', rare: '', epic: '',
  legendary: styles.rarLegendary, mythic: styles.rarMythic,
}
const chipTone: Record<ChipTone, string> = { m: styles.m, a: styles.a, '': '' }

/* ---------- the climb signal ---------- */
const SESSIONS = [
  { d: 'wk 1', w: 180 }, { d: 'wk 2', w: 180 }, { d: 'wk 3', w: 185 }, { d: 'wk 4', w: 185 },
  { d: 'wk 5', w: 190 }, { d: 'wk 6', w: 195 }, { d: 'wk 7', w: 200 }, { d: 'wk 8', w: 205 }, { d: 'now', w: 212 },
]
const GOAL = 225
const CW = 680, CH = 240, PADL = 46, PADR = 30, PADT = 24, PADB = 36, MINW = 165, MAXW = 230
const cx = (i: number) => PADL + (CW - PADL - PADR) * (i / (SESSIONS.length - 1))
const cy = (w: number) => PADT + (CH - PADT - PADB) * (1 - (w - MINW) / (MAXW - MINW))
const CLIMB_D = SESSIONS.map((s, i) => (i ? 'L' : 'M') + cx(i).toFixed(1) + ' ' + cy(s.w).toFixed(1)).join(' ')

/* ---------- floating raw signals behind the hero ---------- */
const FIELD_ICONS = [
  'M6 18V9M12 18V5M18 18v-6',
  'M3 13l4-4 4 3 6-7',
  'M21 12.5A8.5 8.5 0 1 1 11.5 3 7 7 0 0 0 21 12.5z',
  'M12 2v3M12 19v3M2 12h3M19 12h3',
  'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z',
  'M3 12h4l3 8 4-16 3 8h4',
  'M4 19V5M4 19h16M9 15l3-4 3 2 4-6',
]
const FIELD_SPOTS: [number, number][] = [[6, 16], [18, 34], [10, 62], [80, 14], [88, 44], [72, 68], [40, 8], [58, 80], [33, 50], [66, 30]]

export default function VeeFeed() {
  const [simple, setSimple] = useState(false)
  const [reduce, setReduce] = useState(false)
  const [mounted, setMounted] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const climbRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    setMounted(true)
    const m = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')
    if (m) setReduce(m.matches)
  }, [])

  // set the climb line length so the draw animation runs
  useEffect(() => {
    const p = pathRef.current
    if (!p) return
    try { p.style.setProperty('--len', String(p.getTotalLength())) }
    catch { p.style.setProperty('--len', '900') }
  }, [])

  // reveal-on-scroll for the cards + the climb graph
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const arrives = Array.from(root.querySelectorAll<HTMLElement>('[data-arrive]'))
    const climb = climbRef.current

    if (!('IntersectionObserver' in window) || reduce) {
      arrives.forEach((a) => a.classList.add(styles.in))
      if (climb) climb.classList.add(styles.play)
      return
    }
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return
        if (en.target === climb) climb.classList.add(styles.play)
        else en.target.classList.add(styles.in)
        io.unobserve(en.target)
      })
    }, { threshold: 0.24 })
    arrives.forEach((a) => io.observe(a))
    if (climb) io.observe(climb)
    return () => io.disconnect()
  }, [reduce])

  return (
    <div className={`${styles.root} ${simple ? styles.modeSimple : ''}`} ref={rootRef}>
      <div className={styles.wrap}>

        {/* ============ app-like top bar ============ */}
        <div className={styles.bar}>
          <span className={styles.brand}>
            <span className={styles.mark}><Ic name="echo" sw={2.2} /></span>
            <span className={styles.nm}>Vitality <span>&middot; Vee</span></span>
          </span>
          <span className={styles.who}>signed in &middot; you</span>
          <span className={styles.barSpacer} />
          <div className={styles.seg}>
            <button className={`${styles.segb} ${!simple ? styles.on : ''}`} onClick={() => setSimple(false)}>detailed</button>
            <button className={`${styles.segb} ${simple ? styles.on : ''}`} onClick={() => setSimple(true)}>simple</button>
          </div>
        </div>

        {/* ============ hero ============ */}
        <section className={styles.hero}>
          <div className={styles.field}>
            <div className={styles.scan} />
            {mounted && !reduce && FIELD_SPOTS.map((p, i) => {
              const sz = 16 + (i % 4) * 4
              const dur = (5 + (i % 5) * 1.4).toFixed(1)
              return (
                <svg key={i} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
                  style={{ width: sz, height: sz, left: p[0] + '%', top: p[1] + '%', animation: `floatSig ${dur}s ease-in-out ${(i * 0.32).toFixed(2)}s infinite` }}
                  dangerouslySetInnerHTML={{ __html: FIELD_ICONS[i % FIELD_ICONS.length] }} />
              )
            })}
          </div>
          <div className={styles.heroIn}>
            <span className={styles.eyebrow}><span className={styles.dot} />your insight feed &middot; live</span>
            <h1 className={styles.promise}>
              <span className={styles.ln}>Vee has watched you for <span className={styles.mintword}>eight months</span>.</span>
              <span className={styles.ln}>Here is what she <span className={styles.glow}>figured out</span>.</span>
            </h1>
            <p className={styles.sub}>Every lift, weigh-in, meal, quiet night and unplanned spend goes in. On its own, noise. Held all at once, patterns start to glow. These are the links Vee found in <b>your</b> life, graded by how rare and how deep they are.</p>

            <div className={styles.stats}>
              <span className={styles.stat}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg><b>247</b> days logged</span>
              <span className={styles.stat}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M9 15l3-4 3 2 4-6" /></svg><b>6</b> modules feeding in</span>
              <span className={styles.stat}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" /></svg><b>49</b> insights found</span>
              <span className={styles.stat}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9z" /></svg><b>1</b> mythic unlocked</span>
            </div>
          </div>
        </section>

        {/* ============ 01 · the collection ============ */}
        <section className={styles.section}>
          <div className={styles.secHead}><span className={styles.num}>&middot;01</span><span className={styles.lbl}>The collection</span><span className={styles.rule} /></div>
          <p className={styles.secBlurb}>Like the old loot, every insight is graded by how rare it is. The rarer it is, the deeper it goes, and the more of your life it took to find. You keep logging, you keep unlocking. <b>The mythic one only surfaces once.</b></p>
          <div className={styles.rarityWrap}>
            <div className={styles.lh}>your insight collection<span className={styles.lhSpacer} /><span className={styles.tot}>49 found</span></div>
            <div className={styles.rarities}>
              {RARITIES.map((r) => (
                <div key={r.rarity} className={`${styles.rchip} ${rClass[r.rarity]} ${r.cur ? styles.cur : ''}`}>
                  <span className={styles.rgem} />
                  <span className={styles.rname}>{r.name}</span>
                  <span className={styles.rcount}>{r.count}</span>
                  <span className={styles.rmean}>{r.mean}</span>
                </div>
              ))}
            </div>
            <p className={styles.rarityNote}>This is the hunt. The <b>mythic</b> insight, the once-in-a-lifetime one, only surfaced after Vee had held your whole record for months. Scroll down and it is the last card, the deepest thing she knows about you.</p>
          </div>
        </section>

        {/* ============ 02 · the feed ============ */}
        <section className={styles.section}>
          <div className={styles.secHead}><span className={styles.num}>&middot;02</span><span className={styles.lbl}>What Vee found</span><span className={styles.rule} /></div>
          <p className={styles.secBlurb}>Five real finds, climbing from a small true nudge to the one that changes everything. Flip <i>detailed / simple</i> up top: detailed keeps the real numbers, simple dumbs it down to scan in a second.</p>
          <div className={styles.feed}>
            {CARDS.map((c, i) => (
              <div key={i} className={styles.arrive} data-arrive>
                <article className={`${styles.vc} ${rarClass[c.rarity]} ${rClass[c.rarity]}`}>
                  <div className={styles.rarityEdge} />
                  <div className={styles.vtTop}>
                    <div className={styles.vtEcho}><Ic name="echo" sw={2.2} /></div>
                    <div className={styles.vtTag}>Vitality noticed</div>
                    <button className={styles.rbadge}><span className={styles.gem} />{c.rarity}</button>
                    <div className={styles.vtSpacer} />
                    <div className={styles.vtWatched}><Ic name="clock" />watched &middot; {c.watched} &middot; {c.timeframe}</div>
                  </div>
                  <div className={styles.vtBody}>
                    <p className={`${styles.vtLead} ${styles.leadDetailed}`} dangerouslySetInnerHTML={{ __html: c.detailed }} />
                    <p className={`${styles.vtLead} ${styles.leadSimple}`} dangerouslySetInnerHTML={{ __html: c.simple }} />
                    <div className={styles.impact}>
                      <span className={styles.il}>moves your goals</span>
                      {c.goals.map((g, gi) => (
                        <span key={gi} className={styles.gimp}><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l8 13H4z" /></svg>{g}</span>
                      ))}
                    </div>
                    <div className={styles.chips}>
                      {c.chips.map((ch, ci) => (
                        <span key={ci} className={`${styles.chip} ${chipTone[ch.tone]}`}><Ic name={ch.icon} />{ch.text}</span>
                      ))}
                    </div>
                    <div className={styles.acts}>
                      <button className={`${styles.act} ${styles.aMint}`}><Ic name="arrow" />{c.primary}</button>
                      <button className={styles.clB}>
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.6 2.4l1.7 5.4 5.4 1.7-5.4 1.7-1.7 5.4-1.7-5.4-5.4-1.7 5.4-1.7z" /><path d="M18.7 13.6l.8 2.5 2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8z" /></svg>
                        talk deeper in Claude
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            ))}
          </div>
        </section>

        {/* ============ 03 · the signal behind the legendary ============ */}
        <section className={styles.section}>
          <div className={styles.secHead}><span className={styles.num}>&middot;03</span><span className={styles.lbl}>Under the hood</span><span className={styles.rule} /></div>
          <p className={styles.secBlurb}>Every card sits on real signals. Here is one of them: the climb Vee has been tracking toward your bench goal. The insights are only as good as what you feed it, so it keeps getting sharper.</p>
          <div className={styles.climb} ref={climbRef}>
            <div className={styles.climbTop}>
              <span className={styles.ct}>Signal &middot; the climb to your goal</span>
              <span className={styles.cspacer} />
              <span className={styles.cmeta}>bench &middot; lb</span>
            </div>
            <div className={styles.climbChart}>
              <svg viewBox="0 0 680 240" preserveAspectRatio="xMidYMid meet" aria-label="weekly bench climb in pounds">
                <defs>
                  <linearGradient id="climbgrad" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#1f4d3d" />
                    <stop offset="55%" stopColor="#6EE7B7" />
                    <stop offset="100%" stopColor="#A7F3D0" />
                  </linearGradient>
                </defs>
                {[170, 185, 200, 215].map((gw) => (
                  <line key={gw} className={styles.gridline} x1={PADL} y1={cy(gw)} x2={CW - PADR} y2={cy(gw)} />
                ))}
                <line className={styles.baseline} x1={PADL} y1={cy(MINW)} x2={CW - PADR} y2={cy(MINW)} />
                <line className={styles.targetline} x1={PADL} y1={cy(GOAL)} x2={CW - PADR} y2={cy(GOAL)} />
                <text className={styles.targetlbl} x={CW - PADR} y={cy(GOAL) - 6} textAnchor="end">GOAL 225 LB</text>
                <path ref={pathRef} className={styles.climbline} d={CLIMB_D} />
                {SESSIONS.map((s, i) => {
                  const px = cx(i), py = cy(s.w)
                  const delay = (0.25 + 1.7 * (i / (SESSIONS.length - 1)) * 0.86).toFixed(3)
                  return (
                    <g key={i}>
                      <circle className={styles.cdot} cx={px} cy={py} r={4.5} style={{ animationDelay: delay + 's' }} />
                      <text className={styles.clbl} x={px} y={py - 13} style={{ animationDelay: (parseFloat(delay) + 0.05).toFixed(3) + 's' }}>{s.w}</text>
                      <text className={styles.cdate} x={px} y={CH - 12}>{s.d}</text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>

          <div className={styles.ladder}>
            <div className={styles.lh}>how deep Vee goes &middot; you are near the top</div>
            <div className={styles.steps}>
              <div className={`${styles.step} ${styles.done}`}><span className={styles.pip}>1</span><span className={styles.st}><b>Building blocks.</b> One true link between two things. Real and useful.</span></div>
              <div className={`${styles.step} ${styles.done}`}><span className={styles.pip}>2</span><span className={styles.st}><b>The spiral.</b> Several parts of your life turn out to be one story. The money + training + mood find.</span></div>
              <div className={`${styles.step} ${styles.stepOn}`}><span className={styles.pip}>3</span><span className={styles.st}><b>The one you would kill to know.</b> The single lever that changes everything, tied to your biggest goal, over years.<span className={styles.now}>you are here</span></span></div>
            </div>
          </div>
        </section>

        {/* ============ closer ============ */}
        <div className={styles.closer}>
          <p className={styles.big}>Your life, held all at once. <span className={styles.glow}>Now it talks back.</span></p>
          <p className={styles.small}>This is what Vitality is for. The engine is real; the numbers shown are a realistic example, not live data. The hunt never ends, and that is the point.</p>
        </div>

      </div>

      <div className={styles.flag}><span className={styles.d} />demo &middot; example data &middot; not live</div>
    </div>
  )
}
