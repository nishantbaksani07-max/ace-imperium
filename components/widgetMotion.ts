// @ts-nocheck
/* ── Widget design motion ──
   Ported 1:1 from public/widget-design-library.html so a chosen design "animates
   in EXACTLY like the library" wherever it renders: the picker gallery card, the
   live preview, AND the real dashboard tile all call the same animate(). It
   decorates a freshly-rendered design SVG (live DOM) with its ambient motion —
   lines draw on then a glow + comet rides them, bars grow then breathe, ring arcs
   charge in then breathe / slow-spin, waves drift, dots pop in then pulse. The raw
   SVG strings in lib/tiles/designs.ts stay clean; motion is presentation only.

   The motion CSS (keyframes + .m-* classes + the living-dots gate) lives in
   components/veeTiles.css, scoped under .veeTiles .wmArt. Entrance is one-shot
   (always plays); idle loops are gated on the container NOT having .dots-off, so
   flicking a tile's Living dots Off freezes its art (the entrance still plays). */

/** Ambient motion per design key — matches the real tile-art language. */
export const MOTION: Record<string, string> = {
  'ascent-line': 'draw', 'rep-bars': 'bars', 'heartbeat-trace': 'draw', 'streak-row': 'pulse', 'ridge-climb': 'draw', 'effort-ring': 'rings',
  'tide-layers': 'drift', 'crescent-rest': 'draw', 'recovery-rings': 'rings', 'breathing-pulse': 'rings', 'weight-trend': 'draw', 'hrv-ribbon': 'draw',
  'net-worth-ascent': 'draw', 'candles': 'bars', 'growth-mountain': 'draw', 'savings-stack': 'bars', 'budget-ring': 'rings', 'spend-stream': 'drift',
  'mood-wave': 'drift', 'gratitude-spark': 'draw', 'focus-orbit': 'orbit', 'calm-ripples': 'rings', 'journal-lines': 'draw', 'constellation': 'draw',
  'sparkline-end-dot': 'draw', 'bar-set': 'bars', 'ring-gauge-tick': 'rings', 'node-scatter': 'pulse', 'area-chart': 'draw', 'dotted-field': 'pulse',
}

const SVGNS = 'http://www.w3.org/2000/svg'

const prefersReduced = () => {
  try {
    return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// "is this element actually painted with a stroke" — resolves stroke inherited
// from a wrapping <g> (some designs set stroke on the group, not the leaf).
const stroked = (el: Element) => {
  if (el.getAttribute('stroke') === 'none') return false
  if (el.getAttribute('stroke')) return true
  try {
    return getComputedStyle(el).stroke !== 'none'
  } catch {
    return false
  }
}
const opOf = (el: Element, d: string) => parseFloat(el.getAttribute('opacity') || d)

// every design's living dots get a staggered pop-in (entrance) then ride the
// looping pulse (idle, gated in CSS). independent of motion type.
function decorateDots(svg: Element) {
  ;[...svg.querySelectorAll('.dots circle')].forEach((c, i) => {
    c.style.setProperty('--dd', (0.55 + i * 0.07).toFixed(2) + 's')
    c.style.setProperty('--rop', String(opOf(c, '0.7')))
  })
}

// turn a <polyline points> into a path d so offset-path can ride it
function pointsToD(pts: string) {
  const p = (pts || '').trim().split(/\s+/)
  return p.map((pair, i) => (i ? 'L' : 'M') + pair.replace(',', ' ')).join(' ')
}

// a soft glowing dot (+ faint halo, no CSS filter) that travels the primary line
function addComet(svg: Element, primary: Element) {
  const d = primary.tagName.toLowerCase() === 'polyline' ? pointsToD(primary.getAttribute('points')) : primary.getAttribute('d')
  if (!d) return
  const g = document.createElementNS(SVGNS, 'g')
  g.setAttribute('class', 'm-comet')
  g.style.offsetPath = `path('${d}')`
  const halo = document.createElementNS(SVGNS, 'circle')
  halo.setAttribute('r', '5'); halo.setAttribute('fill', 'currentColor'); halo.setAttribute('opacity', '0.18')
  const core = document.createElementNS(SVGNS, 'circle')
  core.setAttribute('r', '2.2'); core.setAttribute('fill', 'currentColor'); core.setAttribute('opacity', '0.95')
  g.appendChild(halo); g.appendChild(core)
  svg.appendChild(g)
}

/**
 * Decorate a freshly-rendered design SVG with its ambient motion. `container` is
 * the element whose innerHTML is the design SVG (gallery card art, live preview,
 * or the live tile's design layer). Idempotent enough for React: re-running on a
 * fresh SVG re-applies cleanly (it only adds classes / one comet node).
 */
export function animate(container: HTMLElement | null, key: string) {
  if (!container) return
  const svg = container.querySelector('svg')
  if (!svg) return
  const motion = MOTION[key] || 'pulse'
  container.setAttribute('data-motion', motion)
  container.removeAttribute('data-spin')
  decorateDots(svg)
  if (prefersReduced()) return

  if (motion === 'draw') {
    const lines = [...svg.querySelectorAll('path,polyline,line')].filter(stroked)
    lines.forEach((el, i) => {
      el.setAttribute('pathLength', '100')
      el.style.setProperty('--op', String(opOf(el, '0.85')))
      el.style.setProperty('--d', (i * 0.12).toFixed(2) + 's')
      el.classList.add('m-draw')
    })
    const primary = lines.find((el) => el.tagName.toLowerCase() !== 'line')
    if (primary) addComet(svg, primary)
  } else if (motion === 'bars') {
    ;[...svg.querySelectorAll('rect,line')]
      .filter((el) => el.tagName.toLowerCase() === 'rect' || el.getAttribute('x1') === el.getAttribute('x2'))
      .sort((a, b) => +(a.getAttribute('x') ?? a.getAttribute('x1')) - +(b.getAttribute('x') ?? b.getAttribute('x1')))
      .forEach((el, i) => {
        el.style.setProperty('--d', (i * 0.07).toFixed(2) + 's')
        el.classList.add('m-bar')
      })
  } else if (motion === 'rings') {
    const donut = !!svg.querySelector('[transform*="rotate"]')
    const arcs = [...svg.querySelectorAll('circle,ellipse,path')].filter((el) => stroked(el) && !el.closest('.dots'))
    if (donut) {
      container.setAttribute('data-spin', '')
      arcs.forEach((el, i) => {
        el.style.setProperty('--op', String(opOf(el, '0.85')))
        el.style.setProperty('--d', (i * 0.12).toFixed(2) + 's')
        if (el.tagName.toLowerCase() === 'path' && !el.getAttribute('stroke-dasharray')) {
          el.setAttribute('pathLength', '100'); el.classList.add('m-arc')
        } else {
          el.classList.add('m-fade')
        }
      })
    } else {
      arcs
        .sort((a, b) => parseFloat(a.getAttribute('r') || '0') - parseFloat(b.getAttribute('r') || '0'))
        .forEach((el, i) => {
          if (el.tagName.toLowerCase() === 'path') {
            el.setAttribute('pathLength', '100')
            el.style.setProperty('--op', String(opOf(el, '0.85')))
            el.style.setProperty('--d', (i * 0.12).toFixed(2) + 's')
            el.classList.add('m-arc')
          } else {
            el.style.setProperty('--op', String(opOf(el, '0.5')))
            el.style.setProperty('--d', (i * 0.5).toFixed(2) + 's')
            el.classList.add('m-ring')
          }
        })
    }
  } else if (motion === 'drift') {
    ;[...svg.querySelectorAll('path')].filter(stroked).forEach((el, i) => {
      el.setAttribute('pathLength', '100')
      el.style.setProperty('--di', (i * 0.1).toFixed(2) + 's')
      el.style.setProperty('--d', (i * -0.9).toFixed(2) + 's')
      el.classList.add('m-drift')
    })
  }
  // 'orbit' idle = whole-SVG spin (CSS on [data-motion=orbit]); 'pulse' = dots only.

  // catch-all entrance: every remaining painted node fades in so nothing pops hard.
  const moved = 'm-draw m-arc m-bar m-ring m-drift m-comet m-fade'.split(' ')
  ;[...svg.querySelectorAll('path,polyline,line,rect,circle,ellipse')].forEach((el, i) => {
    if (el.closest('.dots') || moved.some((c) => el.classList.contains(c))) return
    const fill = el.getAttribute('fill')
    if (!stroked(el) && (!fill || fill === 'none')) return
    el.style.setProperty('--op', String(opOf(el, '0.85')))
    el.style.setProperty('--d', (0.1 + i * 0.05).toFixed(2) + 's')
    el.classList.add('m-fade')
  })
}
