/**
 * Vitality line-art icon library — the modern icon vocabulary used across the
 * app (Fuel, Peak, hubs). Same convention as SubstanceIcon and the logger/setup
 * icons: viewBox 0 0 24 24, no fill, mint `currentColor` stroke at 1.7, round
 * caps/joins. Colour by setting `color` on a wrapper (mint by default).
 *
 * NO emojis anywhere — see feedback: emojis are replaced with these icons; gems
 * come only from the gem-library. Keep every new icon geometric + minimal to
 * match the crystal-library marks (V, plus, hex, bolt, sine…).
 */

export type IconName =
  // nutrition / fuel — macros + tracking (Claude-design "Vitality Icons" set)
  | 'flame' | 'kcal' | 'protein' | 'carbs' | 'carb' | 'fat'
  | 'eaten' | 'goal' | 'foodAte' | 'plate' | 'snack'
  | 'breakfast' | 'lunch' | 'dinner'
  | 'camera' | 'barcode' | 'egg' | 'apple' | 'scale' | 'search'
  | 'drop' | 'pill' | 'bed' | 'plus' | 'dumbbell' | 'coffee'
  // tracking trends
  | 'week' | 'day' | 'cut' | 'maintain' | 'bulk'
  // core ui
  | 'gear' | 'calendar' | 'clock' | 'target' | 'bell' | 'star' | 'trash' | 'arrowRight'
  // health & mind
  | 'heart' | 'sun' | 'chat' | 'sparkles'
  // food source (scan context sheet)
  | 'home' | 'storefront' | 'building' | 'leaf' | 'check' | 'close'

const PATHS: Record<IconName, JSX.Element> = {
  // ── nutrition / fuel — the Claude-design macro & tracking set ──
  // kcal — flame (two strokes: outer flame + inner curl)
  flame: (
    <>
      <path d="M12.6 2.8 C 12.4 6 10.6 7.4 9.4 9.6 C 8.5 11.2 7.2 12.6 7.2 14.8 a4.8 4.8 0 0 0 9.6 0 c 0 -2.5 -1.2 -4.3 -2.8 -5.9 c -0.3 1.4 -1 2 -1.9 2.2 c 0.9 -2.9 0.5 -5.8 0.5 -8.1 Z" />
      <path d="M12 18 a2.2 2.2 0 0 1 -1 -4.2 c 0.4 1.2 1.5 1.1 1.5 2.4 a2.1 2.1 0 0 1 -0.5 1.8" />
    </>
  ),
  kcal: (
    <>
      <path d="M12.6 2.8 C 12.4 6 10.6 7.4 9.4 9.6 C 8.5 11.2 7.2 12.6 7.2 14.8 a4.8 4.8 0 0 0 9.6 0 c 0 -2.5 -1.2 -4.3 -2.8 -5.9 c -0.3 1.4 -1 2 -1.9 2.2 c 0.9 -2.9 0.5 -5.8 0.5 -8.1 Z" />
      <path d="M12 18 a2.2 2.2 0 0 1 -1 -4.2 c 0.4 1.2 1.5 1.1 1.5 2.4 a2.1 2.1 0 0 1 -0.5 1.8" />
    </>
  ),
  // protein — fish (body + tail fin + eye dot)
  protein: (
    <>
      <path d="M15 12 C 12 8.5 6.5 8.5 4 12 C 6.5 15.5 12 15.5 15 12 Z" />
      <path d="M15 12 L 18.6 9.5 L 18.6 14.5 Z" />
      <path d="M6.6 10.9 h0.01" />
    </>
  ),
  // carb — wheat stalk (stem + three pairs of grains)
  carbs: (
    <>
      <path d="M12 20.5 V 9" />
      <path d="M12 8 c 0 -1.6 0.7 -2.6 0 -3.8 c -0.7 1.2 0 2.2 0 3.8 Z" />
      <path d="M12 11.2 c -1.6 -0.3 -2.5 -1.1 -2.6 -2.8 c 1.6 0.2 2.4 1 2.6 2.8 Z" />
      <path d="M12 11.2 c 1.6 -0.3 2.5 -1.1 2.6 -2.8 c -1.6 0.2 -2.4 1 -2.6 2.8 Z" />
      <path d="M12 15 c -1.6 -0.3 -2.5 -1.1 -2.6 -2.8 c 1.6 0.2 2.4 1 2.6 2.8 Z" />
      <path d="M12 15 c 1.6 -0.3 2.5 -1.1 2.6 -2.8 c -1.6 0.2 -2.4 1 -2.6 2.8 Z" />
    </>
  ),
  carb: (
    <>
      <path d="M12 20.5 V 9" />
      <path d="M12 8 c 0 -1.6 0.7 -2.6 0 -3.8 c -0.7 1.2 0 2.2 0 3.8 Z" />
      <path d="M12 11.2 c -1.6 -0.3 -2.5 -1.1 -2.6 -2.8 c 1.6 0.2 2.4 1 2.6 2.8 Z" />
      <path d="M12 11.2 c 1.6 -0.3 2.5 -1.1 2.6 -2.8 c -1.6 0.2 -2.4 1 -2.6 2.8 Z" />
      <path d="M12 15 c -1.6 -0.3 -2.5 -1.1 -2.6 -2.8 c 1.6 0.2 2.4 1 2.6 2.8 Z" />
      <path d="M12 15 c 1.6 -0.3 2.5 -1.1 2.6 -2.8 c -1.6 0.2 -2.4 1 -2.6 2.8 Z" />
    </>
  ),
  // fat — avocado half (body + pit)
  fat: (
    <>
      <path d="M12 3.8 C 14.2 4 15.1 6.6 15.1 8.8 C 15.1 10.5 16.6 11.5 16.6 13.6 A4.6 4.6 0 0 1 7.4 13.6 C 7.4 11.5 8.9 10.5 8.9 8.8 C 8.9 6.6 9.8 4 12 3.8 Z" />
      <circle cx="12" cy="13.8" r="2.3" />
    </>
  ),
  // eaten — fork & knife
  eaten: (
    <>
      <path d="M8.2 3.6 V 7.8" />
      <path d="M10.3 3.6 V 7.8" />
      <path d="M12.4 3.6 V 7.8" />
      <path d="M8.2 7.8 c 0 1.5 2.1 1.5 2.1 3 V 20.4" />
      <path d="M12.4 7.8 c 0 1.5 -2.1 1.5 -2.1 3" />
      <path d="M16.4 20.4 V 12 c -2 -0.8 -2 -6.8 0 -8 c 2 1.2 2 7.2 0 8" />
    </>
  ),
  // goal — pennant flag
  goal: (
    <>
      <path d="M7.2 20.5 V 3.6" />
      <path d="M7.2 4.2 L 17 6.5 L 7.2 8.8 Z" />
    </>
  ),
  // food ate — plate (two concentric rings)
  foodAte: (
    <>
      <circle cx="12" cy="12" r="7.6" />
      <circle cx="12" cy="12" r="4.3" />
    </>
  ),
  plate: (
    <>
      <circle cx="12" cy="12" r="7.6" />
      <circle cx="12" cy="12" r="4.3" />
    </>
  ),
  // snack — cookie (round body + chip dots)
  snack: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M9.4 9.6 h0.01" />
      <path d="M14.4 9.2 h0.01" />
      <path d="M13.4 13.4 h0.01" />
      <path d="M9.7 14.2 h0.01" />
      <path d="M15.1 13 h0.01" />
    </>
  ),
  // breakfast — sunrise (half sun cresting a horizon + rays)
  breakfast: (
    <>
      <path d="M4 18.4 H 20" />
      <path d="M7.7 18.4 a4.3 4.3 0 0 1 8.6 0" />
      <path d="M12 7.6 V 9.6" />
      <path d="M5.6 12.8 L 7.1 13.9" />
      <path d="M18.4 12.8 L 16.9 13.9" />
    </>
  ),
  // lunch — full noon sun
  lunch: (
    <>
      <circle cx="12" cy="12" r="3.3" />
      <path d="M12 4.2 V 6.2" />
      <path d="M12 17.8 V 19.8" />
      <path d="M4.2 12 H 6.2" />
      <path d="M17.8 12 H 19.8" />
      <path d="M6.5 6.5 L 7.9 7.9" />
      <path d="M16.1 16.1 L 17.5 17.5" />
      <path d="M17.5 6.5 L 16.1 7.9" />
      <path d="M7.9 16.1 L 6.5 17.5" />
    </>
  ),
  // dinner — crescent moon + small star
  dinner: (
    <>
      <path d="M16 16 A6.8 6.8 0 1 1 12.4 4.2 A5.2 5.2 0 0 0 16 16 Z" />
      <path d="M18 4.6 C 18.3 6 18.4 6.1 19.8 6.4 C 18.4 6.7 18.3 6.8 18 8.2 C 17.7 6.8 17.6 6.7 16.2 6.4 C 17.6 6.1 17.7 6 18 4.6 Z" />
    </>
  ),
  camera: (
    <>
      <rect x="3.5" y="7" width="17" height="12.5" rx="2.6" />
      <path d="M9 7l1.2-2.2h3.6L15 7" />
      <circle cx="12" cy="13.2" r="3.1" />
    </>
  ),
  barcode: (
    <path d="M4 5v14M6.4 5v14M8 5v14M11 5v14M13.4 5v14M15 5v14M18 5v14M20 5v14" />
  ),
  egg: (
    <path d="M12 4c3.3 0 5.6 4.4 5.6 8.2a5.6 6.6 0 1 1-11.2 0C6.4 8.4 8.7 4 12 4Z" />
  ),
  apple: (
    <>
      <path d="M12 8.2c-1-1.4-2.9-1.9-4.3-1C6.1 8 5.6 10 6.1 12.4c.5 2.3 2 4.8 3.5 5.3 1 .3 1.6-.3 2.4-.3s1.4.6 2.4.3c1.5-.5 3-3 3.5-5.3.5-2.4 0-4.4-1.6-5.2-1.4-.9-3.3-.4-4.3 1Z" />
      <path d="M12 8.2c-.1-1.6.6-3.1 2.4-3.7" />
    </>
  ),
  scale: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.2" />
      <path d="M8.6 13a3.4 3.4 0 0 1 6.8 0" />
      <path d="M12 13l1.8-2.2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M19.5 19.5 15.3 15.3" />
    </>
  ),
  // drop — water / hydration teardrop
  drop: (
    <path d="M12 3.2c3.6 4.6 5.8 7.6 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-3 2.2-6 5.8-10.6Z" />
  ),
  // pill — supplement capsule (split body)
  pill: (
    <>
      <path d="M10.5 20.5 20.5 10.5a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="M8.5 8.5 15.5 15.5" />
    </>
  ),
  // bed — before bed / sleep
  bed: (
    <>
      <path d="M3 8v9M3 13h18v4M21 13v-2a2 2 0 0 0-2-2h-7v4" />
      <path d="M7 11.5a1.4 1.4 0 1 0 .01 0" />
    </>
  ),
  // plus — add
  plus: <path d="M12 5v14M5 12h14" />,
  // dumbbell — training
  dumbbell: (
    <>
      <path d="M9 12h6" />
      <path d="M6.6 9.4v5.2M9 8.2v7.6" />
      <path d="M17.4 9.4v5.2M15 8.2v7.6" />
    </>
  ),
  // coffee — pairs with caffeine
  coffee: (
    <>
      <path d="M5 8.5h11v4.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8.5Z" />
      <path d="M16 9.5h2.3a2.2 2.2 0 0 1 0 4.4H16" />
      <path d="M8.2 3.6c-.5 1 .5 1.5 0 2.6M11.4 3.6c-.5 1 .5 1.5 0 2.6" />
    </>
  ),
  // ── tracking trends ──
  // week — calendar with day-dot grid
  week: (
    <>
      <rect x="5" y="6" width="14" height="14" rx="2.4" />
      <path d="M9 4.2 V 7.4" />
      <path d="M15 4.2 V 7.4" />
      <path d="M5 10 H 19" />
      <path d="M8.6 13.2 h0.01" />
      <path d="M12 13.2 h0.01" />
      <path d="M15.4 13.2 h0.01" />
      <path d="M8.6 16.6 h0.01" />
      <path d="M12 16.6 h0.01" />
      <path d="M15.4 16.6 h0.01" />
    </>
  ),
  // day — single dog-eared calendar page
  day: (
    <>
      <path d="M7.5 4.5 H15 A2 2 0 0 1 17 6.5 V13.5 L12.5 19.5 H6.5 A2 2 0 0 1 4.5 17.5 V6.5 A2 2 0 0 1 6.5 4.5 Z" />
      <path d="M17 13.5 H12.5 V19.5" />
      <path d="M4.5 8.6 H17" />
    </>
  ),
  // cut — weight trend sloping down
  cut: (
    <>
      <path d="M4 8 L 9.3 11 L 13.4 9.6 L 19.5 15.6" />
      <path d="M16.1 15.6 L 19.5 15.6 L 19.5 12.2" />
    </>
  ),
  // maintain — weight trend staying flat
  maintain: (
    <>
      <path d="M4 12 L 9.3 11 L 13.4 13 L 18 12" />
      <path d="M14.9 8.7 L 18 12 L 14.9 15.3" />
    </>
  ),
  // bulk — weight trend sloping up
  bulk: (
    <>
      <path d="M4 16 L 9.3 13 L 13.4 14.4 L 19.5 8.4" />
      <path d="M16.1 8.4 L 19.5 8.4 L 19.5 11.8" />
    </>
  ),
  // ── core ui ──
  gear: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.4" />
      <path d="M4 10h16M8.5 3v4.5M15.5 3v4.5" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3.2 1.9" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="12" cy="12" r="0.9" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5h12l-1.5-2.4V10a4.5 4.5 0 0 0-9 0v4.1L6 16.5Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </>
  ),
  star: (
    <path d="M12 3.6l2.5 5.2 5.6.8-4.1 4 1 5.6L12 16.6 6.9 19.2l1-5.6-4.1-4 5.6-.8L12 3.6Z" />
  ),
  trash: (
    <path d="M5 7h14M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
  ),
  arrowRight: (
    <path d="M4 12h15M13 6l6 6-6 6" />
  ),
  // ── health & mind ──
  heart: (
    <path d="M12 20.3 4.6 12.9a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5L12 20.3Z" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3" />
    </>
  ),
  chat: (
    <path d="M5 5.5h14a2.2 2.2 0 0 1 2.2 2.2v6.4a2.2 2.2 0 0 1-2.2 2.2h-7.2L7 19.5v-3.2H5A2.2 2.2 0 0 1 2.8 14.1V7.7A2.2 2.2 0 0 1 5 5.5Z" />
  ),
  sparkles: (
    <>
      <path d="M11 4l1.5 3.9L16.4 9.4 12.5 11 11 14.9 9.5 11 5.6 9.4 9.5 7.9 11 4Z" />
      <path d="M18 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" />
    </>
  ),
  // ── food source — scan context ──
  // home — homemade (roof + body + door)
  home: (
    <>
      <path d="M4 11 L12 4 L20 11" />
      <path d="M6 9.5 V20 h12 V9.5" />
      <path d="M10 20 v-5 h4 v5" />
    </>
  ),
  // storefront — restaurant / takeout (awning + shop)
  storefront: (
    <>
      <path d="M4.5 9.5 L6 4.8 H18 L19.5 9.5" />
      <path d="M4.5 9.5 a1.9 1.9 0 0 0 3.75 0 a1.9 1.9 0 0 0 3.75 0 a1.9 1.9 0 0 0 3.75 0 a1.9 1.9 0 0 0 3.75 0" />
      <path d="M6 11.4 V20 h12 v-8.6" />
      <path d="M10 20 v-4.6 h4 V20" />
    </>
  ),
  // building — dining hall (tall block + windows)
  building: (
    <>
      <path d="M3.5 20.5 H20.5" />
      <path d="M5.5 20.5 V5 a1 1 0 0 1 1 -1 H13 a1 1 0 0 1 1 1 V20.5" />
      <path d="M14 20.5 V9 H17.5 a1 1 0 0 1 1 1 V20.5" />
      <path d="M8 8 h3 M8 11.5 h3 M8 15 h3" />
    </>
  ),
  // leaf — whole foods (single leaf + vein)
  leaf: (
    <>
      <path d="M5 19 C5 11 11 5 19 5 C19 13 13 19 5 19 Z" />
      <path d="M9 15 C12 12 15 10 17.5 9" />
    </>
  ),
  // check — selected tick
  check: <path d="M5 12.5 9.5 17 19 6.5" />,
  // close — remove / dismiss
  close: <path d="M6 6 18 18 M18 6 6 18" />,
}

interface Props {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export default function VitalityIcon({ name, size = 20, className, strokeWidth = 1.7 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  )
}
