/**
 * presetViz - one bespoke micro-visual per library piece (BUILD81).
 *
 * Every preset in lib/tiles/quickLibrary.ts gets its OWN tiny scene: a pure
 * inline SVG (168x64) drawn in the Vitality palette, different in structure,
 * not just in color - footprints walk, glasses fill, the mood needle leans,
 * the cigarette is broken, the bed is made. Personality lives here.
 *
 * Styling + motion live in components/libraryViz.css (a plain global sheet,
 * the veeTiles.css pattern) so this module stays importable anywhere. Motion
 * only runs while a card is hovered / is the finder's first match (the
 * `.lspec` scope), transform+opacity only, reduced-motion safe.
 *
 * Coverage is tested: __tests__/quickLibrary.test.ts asserts every preset id
 * has a scene here (and blankViz covers the six start-blank shapes).
 */
import type { ReactNode } from 'react'

/* Tiny shared marks (used sparingly - scenes must stay distinct). */
const SPARK = 'M12 3c.6 3.9 2.4 6.9 9 9c-6.6 2.1-8.4 5.1-9 9c-.6-3.9-2.4-6.9-9-9c6.6-2.1 8.4-5.1 9-9Z'
const FLAME =
  'M12.5 2c.8 3.2-.9 5-2.2 6.6C9 10.2 8 11.8 8 13.8a4.8 4.8 0 0 0 9.6 0c0-1.6-.6-3-1.6-4.3-.4 1.1-1.1 1.8-2 2.2.5-3-.1-6.7-1.5-9.7z'
const MOON = 'M20.6 14.2A8.6 8.6 0 0 1 9.8 3.4a8.6 8.6 0 1 0 10.8 10.8Z'

export const PRESET_VIZ: Record<string, ReactNode> = {
  /* ── Body ─────────────────────────────────────────────────────────────── */

  // A trail climbing gently, footprints lighting along it.
  steps: (
    <svg className="lv lv-steps" viewBox="0 0 168 64" aria-hidden>
      <path className="lvSd lvDash" d="M14 50 C 60 46, 104 32, 154 16" />
      {[
        [26, 46, -16],
        [52, 42, 14],
        [78, 36, -14],
        [104, 30, 15],
        [130, 24, -15],
      ].map(([x, y, r], i) => (
        <g key={i} className={`fp ${i < 3 ? 'on' : ''}`} transform={`translate(${x} ${y}) rotate(${r})`}>
          <ellipse cx="-3" cy="0" rx="2" ry="3.4" />
          <ellipse cx="3" cy="-2" rx="2" ry="3.4" />
        </g>
      ))}
      <text className="lvT" x="126" y="52">
        10,000
      </text>
    </svg>
  ),

  // A loaded barbell that pumps.
  pushups: (
    <svg className="lv lv-pushups" viewBox="0 0 168 64" aria-hidden>
      <g className="bar">
        <line className="lvS" x1="46" y1="28" x2="122" y2="28" />
        <rect className="lvF" x="38" y="18" width="5" height="20" rx="2" />
        <rect className="lvF" x="46" y="21" width="4" height="14" rx="2" />
        <rect className="lvF" x="125" y="18" width="5" height="20" rx="2" />
        <rect className="lvF" x="118" y="21" width="4" height="14" rx="2" />
      </g>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line key={i} className={`rep ${i < 4 ? 'on' : ''}`} x1={52 + i * 9} y1="46" x2={52 + i * 9} y2="52" />
      ))}
    </svg>
  ),

  // A week of session columns, the done ones standing proud.
  workouts: (
    <svg className="lv lv-workouts" viewBox="0 0 168 64" aria-hidden>
      {[18, 26, 12, 30, 22, 16, 28].map((h, i) => (
        <rect
          key={i}
          className={`col ${[0, 1, 3, 5].includes(i) ? 'on' : ''}`}
          x={32 + i * 16}
          y={52 - h}
          width="10"
          height={h}
          rx="3"
        />
      ))}
      <line className="lvSd" x1="28" y1="52" x2="140" y2="52" />
    </svg>
  ),

  // The slow line, drifting kindly to a glowing now.
  weight: (
    <svg className="lv lv-weight" viewBox="0 0 168 64" aria-hidden>
      <path className="lvS trend" d="M14 24 C 54 30, 96 42, 148 36" />
      <circle className="lvFd" cx="14" cy="24" r="2.2" />
      <circle className="glowDot" cx="148" cy="36" r="7" />
      <circle className="lvF nowDot" cx="148" cy="36" r="3.2" />
      <text className="lvT" x="140" y="18">
        kg
      </text>
    </svg>
  ),

  // A measuring tape drawn as an arc, ticks and all.
  waist: (
    <svg className="lv lv-waist" viewBox="0 0 168 64" aria-hidden>
      <path className="lvSd" d="M26 52 Q 84 12, 142 52" />
      <path className="lvSd" d="M30 56 Q 84 18, 138 56" />
      {[0.18, 0.32, 0.46, 0.6, 0.74].map((t, i) => {
        const x = 26 + (142 - 26) * t
        const y = 52 - Math.sin(Math.PI * t) * 33
        return <line key={i} className={`tick ${i === 2 ? 'on' : ''}`} x1={x} y1={y} x2={x} y2={y + 6} />
      })}
      <text className="lvT" x="78" y="58">
        cm
      </text>
    </svg>
  ),

  // The cold water line, mid-plunge, droplets up.
  coldplunge: (
    <svg className="lv lv-coldplunge" viewBox="0 0 168 64" aria-hidden>
      <path className="lvS wave" d="M16 38 Q 34 32, 52 38 T 88 38 T 124 38 T 152 38" />
      <circle className="lvF dip" cx="84" cy="41" r="5" />
      <circle className="drop d1" cx="74" cy="26" r="1.8" />
      <circle className="drop d2" cx="86" cy="20" r="2.2" />
      <circle className="drop d3" cx="96" cy="27" r="1.6" />
      <g className="frost" transform="translate(34 18) scale(0.32)">
        <path d={SPARK} />
      </g>
      <g className="frost f2" transform="translate(126 16) scale(0.26)">
        <path d={SPARK} />
      </g>
    </svg>
  ),

  // A moon, a meter of hours, two patient stars.
  sleep: (
    <svg className="lv lv-sleep" viewBox="0 0 168 64" aria-hidden>
      <g className="moon" transform="translate(30 16) scale(1.3)">
        <path d={MOON} />
      </g>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = Math.PI - (i / 7) * Math.PI
        const x1 = 104 + Math.cos(a) * 26
        const y1 = 50 - Math.sin(a) * 26
        const x2 = 104 + Math.cos(a) * 33
        const y2 = 50 - Math.sin(a) * 33
        return <line key={i} className={`hr ${i < 6 ? 'on' : ''}`} x1={x1} y1={y1} x2={x2} y2={y2} />
      })}
      <circle className="star s1" cx="66" cy="14" r="1.4" />
      <circle className="star s2" cx="146" cy="20" r="1.7" />
    </svg>
  ),

  /* ── Mind ─────────────────────────────────────────────────────────────── */

  // The one-to-ten dial, needle leaning honest.
  mood: (
    <svg className="lv lv-mood" viewBox="0 0 168 64" aria-hidden>
      <path className="lvSd" d="M40 50 A 44 44 0 0 1 128 50" />
      {[...Array(10)].map((_, i) => {
        const a = Math.PI - (i / 9) * Math.PI
        const x1 = 84 + Math.cos(a) * 38
        const y1 = 50 - Math.sin(a) * 38
        const x2 = 84 + Math.cos(a) * 44
        const y2 = 50 - Math.sin(a) * 44
        return <line key={i} className={`tk ${i < 7 ? 'on' : ''}`} x1={x1} y1={y1} x2={x2} y2={y2} />
      })}
      <g className="needle">
        <line className="lvS" x1="84" y1="50" x2="105" y2="22" />
      </g>
      <circle className="lvF" cx="84" cy="50" r="2.6" />
    </svg>
  ),

  // A jagged start easing into calm water.
  stress: (
    <svg className="lv lv-stress" viewBox="0 0 168 64" aria-hidden>
      <path className="lvSd" d="M14 32 L 24 18 L 34 44 L 44 22 L 54 40 L 64 28" />
      <g className="calm">
        <path className="lvS" d="M64 28 C 78 36, 92 28, 106 32 S 134 34, 152 32" />
      </g>
    </svg>
  ),

  // Breath rings, widening and settling.
  meditation: (
    <svg className="lv lv-meditation" viewBox="0 0 168 64" aria-hidden>
      <circle className="ring r3" cx="84" cy="32" r="24" />
      <circle className="ring r2" cx="84" cy="32" r="16" />
      <circle className="ring r1" cx="84" cy="32" r="8" />
      <circle className="lvF core" cx="84" cy="32" r="2.4" />
    </svg>
  ),

  // An open book, the left page already lived in.
  reading: (
    <svg className="lv lv-reading" viewBox="0 0 168 64" aria-hidden>
      <path className="page" d="M84 16 C 70 11, 56 13, 46 18 L 46 46 C 56 41, 70 41, 84 46 Z" />
      <path className="page" d="M84 16 C 98 11, 112 13, 122 18 L 122 46 C 112 41, 98 41, 84 46 Z" />
      <line className="lvS spine" x1="84" y1="16" x2="84" y2="46" />
      {[24, 30, 36].map((y, i) => (
        <line key={i} className="tx on" x1="52" y1={y} x2="76" y2={y - 2} />
      ))}
      {[24, 30, 36].map((y, i) => (
        <line key={`r${i}`} className={`tx rline r${i}`} x1="92" y1={y - 2} x2="116" y2={y} />
      ))}
      <text className="lvT" x="128" y="14">
        20
      </text>
    </svg>
  ),

  // A blossom of thanks inside a quiet ring.
  gratitude: (
    <svg className="lv lv-gratitude" viewBox="0 0 168 64" aria-hidden>
      <circle className="lvSd" cx="84" cy="32" r="20" />
      {[
        [84, 15, 0.42, 'p1 on'],
        [101, 32, 0.34, 'p2'],
        [84, 49, 0.34, 'p3 on'],
        [67, 32, 0.34, 'p4'],
      ].map(([x, y, s, cls], i) => (
        <g key={i} className={`petal ${cls}`} transform={`translate(${Number(x) - 12 * Number(s)} ${Number(y) - 12 * Number(s)}) scale(${s})`}>
          <path d={SPARK} />
        </g>
      ))}
    </svg>
  ),

  // The phone, its bar shrinking. Down is the win.
  screentime: (
    <svg className="lv lv-screentime" viewBox="0 0 168 64" aria-hidden>
      <rect className="lvSd" x="64" y="8" width="34" height="48" rx="7" />
      <line className="lvSd" x1="76" y1="13" x2="86" y2="13" />
      <rect className="usage" x="72" y="26" width="18" height="24" rx="3" />
      <path className="lvS goodArrow" d="M112 26 v14 m0 0 l-4 -5 m4 5 l4 -5" />
    </svg>
  ),

  // A written line still wet, nib resting, day checked.
  journaling: (
    <svg className="lv lv-journaling" viewBox="0 0 168 64" aria-hidden>
      <path className="lvS ink" d="M20 40 C 40 30, 58 46, 80 38 S 114 30, 126 35" />
      <g className="nib" transform="translate(128 30) rotate(40)">
        <path className="lvF" d="M0 0 L7 3 L3 7 Z" />
        <line className="lvS" x1="6" y1="5" x2="12" y2="11" />
      </g>
      <path className="lvS check" d="M142 18 l4 4 l7 -8" />
    </svg>
  ),

  /* ── Money ────────────────────────────────────────────────────────────── */

  // Coins leaving the wallet, watched all the way out.
  spend: (
    <svg className="lv lv-spend" viewBox="0 0 168 64" aria-hidden>
      <rect className="lvSd" x="26" y="20" width="46" height="27" rx="6" />
      <line className="lvS" x1="26" y1="29" x2="72" y2="29" />
      <circle className="coin c1" cx="90" cy="33" r="6" />
      <circle className="coin c2" cx="108" cy="33" r="6" />
      <circle className="coin c3" cx="126" cy="33" r="6" />
      <text className="lvTm" x="87.5" y="36.4">
        $
      </text>
    </svg>
  ),

  // The pile that grows because you left it alone.
  savings: (
    <svg className="lv lv-savings" viewBox="0 0 168 64" aria-hidden>
      <ellipse className="coinS" cx="70" cy="47" rx="17" ry="5" />
      <ellipse className="coinS" cx="70" cy="40" rx="17" ry="5" />
      <ellipse className="coinS" cx="70" cy="33" rx="17" ry="5" />
      <ellipse className="coinS newCoin" cx="70" cy="16" rx="17" ry="5" />
      <path className="lvS plus" d="M110 28 h10 m-5 -5 v10" />
      <text className="lvTm" x="124" y="34">
        $
      </text>
    </svg>
  ),

  // Seven days, five survived without buying a thing.
  nobuy: (
    <svg className="lv lv-nobuy" viewBox="0 0 168 64" aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i} transform={`translate(${28 + i * 17} 24)`}>
          <rect className={`day ${i < 5 ? 'on' : ''} ${i === 5 ? 'next' : ''}`} width="13" height="13" rx="4" />
          {i < 5 && <path className="strike" d="M3.5 6.5 h6" />}
        </g>
      ))}
    </svg>
  ),

  /* ── Fuel ─────────────────────────────────────────────────────────────── */

  // Eight little glasses, filling left to right.
  water: (
    <svg className="lv lv-water" viewBox="0 0 168 64" aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <g key={i} transform={`translate(${25 + i * 15} 22)`}>
          <path className="glass" d="M0 0 L10 0 L8.6 20 L1.4 20 Z" />
          <path className={`waterFill ${i < 5 ? 'on' : ''} ${i === 5 ? 'next' : ''}`} d="M1.2 8 L8.8 8 L8.6 20 L1.4 20 Z" />
        </g>
      ))}
    </svg>
  ),

  // The cup, the saucer, the steam still moving.
  coffee: (
    <svg className="lv lv-coffee" viewBox="0 0 168 64" aria-hidden>
      <path className="lvSd cupBody" d="M64 26 h32 v12 a10 10 0 0 1 -10 10 h-12 a10 10 0 0 1 -10 -10 Z" />
      <path className="lvSd" d="M96 29 h6 a5 5 0 0 1 0 10 h-7" />
      <line className="lvSd" x1="58" y1="54" x2="104" y2="54" />
      <path className="steam s1" d="M72 20 C 70 16, 74 13, 72 9" />
      <path className="steam s2" d="M82 21 C 80 16, 84 13, 82 8" />
      <path className="steam s3" d="M92 20 C 90 16, 94 13, 92 9" />
    </svg>
  ),

  // The scoop-marked fill, climbing in grams.
  protein: (
    <svg className="lv lv-protein" viewBox="0 0 168 64" aria-hidden>
      <rect className="lvSd" x="70" y="10" width="28" height="44" rx="6" />
      <rect className="pfill" x="73" y="27" width="22" height="24" rx="4" />
      {[18, 28, 38].map((y, i) => (
        <line key={i} className="lvSd" x1="63" y1={y} x2="70" y2={y} />
      ))}
      <text className="lvT" x="106" y="16">
        g
      </text>
    </svg>
  ),

  // One ring for the whole day of eating.
  calories: (
    <svg className="lv lv-calories" viewBox="0 0 168 64" aria-hidden>
      <circle className="lvSd" cx="70" cy="32" r="19" />
      <circle className="kring" cx="70" cy="32" r="19" />
      <text className="lvT" x="61" y="35">
        kcal
      </text>
      <g className="forkG">
        <line className="lvSd" x1="108" y1="20" x2="108" y2="44" />
        <path className="lvSd" d="M104 20 v7 a4 4 0 0 0 8 0 v-7" />
      </g>
    </svg>
  ),

  // The scoop mid-pour, five faithful grams.
  creatine: (
    <svg className="lv lv-creatine" viewBox="0 0 168 64" aria-hidden>
      <path className="lvFd mound" d="M56 50 Q 84 36, 112 50 Z" />
      <g className="scoop" transform="translate(96 14) rotate(24)">
        <path className="lvSd" d="M0 0 a8 8 0 0 0 16 0 Z" />
        <line className="lvSd" x1="16" y1="-1" x2="26" y2="-6" />
      </g>
      <circle className="grain g1" cx="92" cy="28" r="1.5" />
      <circle className="grain g2" cx="87" cy="35" r="1.3" />
      <circle className="grain g3" cx="95" cy="38" r="1.2" />
      <text className="lvT" x="42" y="20">
        5g
      </text>
    </svg>
  ),

  // The glass with a cap line. Staying under it is the game.
  alcohol: (
    <svg className="lv lv-alcohol" viewBox="0 0 168 64" aria-hidden>
      <path className="lvSd" d="M66 12 L 102 12 L 96 50 L 72 50 Z" />
      <path className="pour" d="M70.5 40 L 97.5 40 L 96 50 L 72 50 Z" />
      <line className="capLine" x1="62" y1="24" x2="106" y2="24" />
      <text className="lvT" x="112" y="27">
        cap
      </text>
    </svg>
  ),

  // Broken in two, counting down to none.
  cigarettes: (
    <svg className="lv lv-cigarettes" viewBox="0 0 168 64" aria-hidden>
      <g className="cigL">
        <rect className="lvSd" x="38" y="28" width="42" height="9" rx="3" />
        <rect className="lvFd" x="38" y="28" width="10" height="9" rx="3" />
      </g>
      <g className="cigR" transform="rotate(9 116 33)">
        <rect className="lvSd" x="92" y="28" width="34" height="9" rx="3" />
      </g>
      <path className="lvS zeroArrow" d="M138 22 v14 m0 0 l-4 -5 m4 5 l4 -5" />
      <text className="lvTm" x="146" y="38">
        0
      </text>
    </svg>
  ),

  /* ── Habits ───────────────────────────────────────────────────────────── */

  // The flame you keep by showing up.
  gymstreak: (
    <svg className="lv lv-gymstreak" viewBox="0 0 168 64" aria-hidden>
      <g className="flame" transform="translate(70 8) scale(1.15)">
        <path d={FLAME} />
      </g>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <circle key={i} className={`dot ${i < 5 ? 'on' : ''} ${i === 5 ? 'next' : ''}`} cx={48 + i * 12} cy="52" r="2.6" />
      ))}
    </svg>
  ),

  // The sun barely up, and you already won.
  wakeearly: (
    <svg className="lv lv-wakeearly" viewBox="0 0 168 64" aria-hidden>
      <line className="lvSd" x1="24" y1="44" x2="144" y2="44" />
      <g className="sunG">
        <path className="sun" d="M66 44 a18 18 0 0 1 36 0 Z" />
        {[-60, -30, 0, 30, 60].map((deg, i) => (
          <line
            key={i}
            className={`ray ${i % 2 === 0 ? 'long' : ''}`}
            x1={84 + Math.sin((deg * Math.PI) / 180) * 24}
            y1={44 - Math.cos((deg * Math.PI) / 180) * 24}
            x2={84 + Math.sin((deg * Math.PI) / 180) * (i % 2 === 0 ? 30 : 27)}
            y2={44 - Math.cos((deg * Math.PI) / 180) * (i % 2 === 0 ? 30 : 27)}
          />
        ))}
      </g>
      <text className="lvT" x="24" y="16">
        6:00
      </text>
    </svg>
  ),

  // The cloud thinning out of the picture.
  novaping: (
    <svg className="lv lv-novaping" viewBox="0 0 168 64" aria-hidden>
      <g className="cloud">
        <path className="lvSd" d="M34 38 a8 8 0 0 1 2 -15 a10 10 0 0 1 19 -3 a7 7 0 0 1 6 12 Z" />
      </g>
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} className={`fadeDot fd${i}`} cx={78 + i * 13} cy={30 - (i % 2) * 4} r={2.4 - i * 0.35} />
      ))}
      <g className="cleanSpark" transform="translate(140 22) scale(0.4)">
        <path d={SPARK} />
      </g>
    </svg>
  ),

  // Corners tucked, pillow set, first win done.
  madebed: (
    <svg className="lv lv-madebed" viewBox="0 0 168 64" aria-hidden>
      <path className="lvSd" d="M44 20 v24 h84 v-14 a6 6 0 0 0 -6 -6 h-62" />
      <line className="lvSd" x1="44" y1="50" x2="50" y2="50" />
      <line className="lvSd" x1="122" y1="50" x2="128" y2="50" />
      <rect className="pillow" x="50" y="26" width="20" height="9" rx="4" />
      <path className="blanket" d="M76 30 h52 v14 h-84 v-6 a8 8 0 0 1 8 -8 Z" />
      <path className="fold" d="M76 30 l10 14 h-10 Z" />
      <path className="lvS check" d="M134 14 l4 4 l7 -8" />
    </svg>
  ),
}

/** The six start-blank shapes: a dashed stage and the shape's own mark - the
 *  plainness IS the personality (you bring the subject). */
export function blankViz(iconPath: string): ReactNode {
  return (
    <svg className="lv lv-blank" viewBox="0 0 168 64" aria-hidden>
      <rect className="frame" x="24" y="8" width="120" height="48" rx="12" />
      <g transform="translate(72 20)">
        <path className="mark" d={iconPath} transform="scale(1.0)" />
      </g>
    </svg>
  )
}
