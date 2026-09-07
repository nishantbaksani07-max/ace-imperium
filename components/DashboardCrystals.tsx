'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLYPHS, type GlyphName } from '@/lib/gemGlyphs'

/**
 * DashboardCrystals — shared-canvas Three.js renderer for every gem on
 * the dashboard. One <canvas> covering the viewport, one renderer, one
 * PMREM environment, scissored viewport per gem.
 *
 * Why this exists: SectionGem (the welcome-page V gem) creates its own
 * WebGL renderer + PMREM environment per instance. Browsers cap WebGL
 * contexts (Chrome ~16, perf gets shaky around 8) so we cannot ship six
 * SectionGems on one dashboard. The crystal-library page at
 * design-iterations/crystal-library/index.html solves this by sharing
 * the canvas across all its gems — this component is the React port of
 * that same pattern.
 *
 * Behavior parity with SectionGem (the canonical Vitality gem language):
 *   - Procedural PMREM environment painted from mint + warm radial gradients
 *   - MeshPhysicalMaterial glass (transmission, IOR, clearcoat, attenuation)
 *   - Cool-mint wireframe overlay on edges
 *   - Five-layer glyph glow stack baked into a 512² canvas texture
 *   - Rest pose locks the most-front face dead-on to the camera at mount
 *   - Gentle sin bob + window-scoped cursor tilt layered on rest pose
 *   - Idle glyph morph: section glyph ⇄ V every 12-24s (random) with
 *     a 0.55s glitch transition (rapid strobe + texture swap at midpoint)
 *   - Random idle pulse every 20-45s (scale + emissive heartbeat)
 *   - prefers-reduced-motion freezes everything to a still resting pose
 *
 * Per-gem placement: each tile renders an empty
 * `<div data-crystal-slot={id} />` where the gem should appear. The
 * canvas picks those slots up once via `querySelectorAll` after mount,
 * caches them, and each frame uses their `getBoundingClientRect()` to
 * set the WebGL viewport + scissor rect to that screen region.
 *
 * Off-screen gems are skipped entirely each frame (no compute, no
 * render). Brand gems (`glyph: 'V'`) skip the morph since "V ↔ V" is
 * a no-op.
 *
 * Sizing: real 3D crystals read cleanly at ≥240px. Below that the glass
 * gets compressed but still reads as a faceted gem (not as flat SVG).
 * Dashboard tile slots are ~120-160px which is below the ideal but is
 * the right tradeoff for the bento layout.
 */

const PARAMS = {
  // Bob amplitude matches the welcome-page SectionGem (0.10), so the gems
  // have a visible gentle sway / rotational feel without losing the
  // dead-on face that keeps the glyph readable.
  wobbleAmplitude: 0.10,
  // Super-soft cursor pull. The gems barely notice the cursor — just a
  // whisper of a turn when it's nearby. Distance falloff in the tick
  // loop scales this down further when the cursor is far.
  cursorTilt: 0.08,
  spring: 0.06,
  mintTint: 0.12,
  roughness: 0.08,
  transmission: 0.82,
  thickness: 1.8,
  ior: 1.55,
  keyWarmth: 0.55,
}

// Distance falloff for the cursor proximity pull. The gem feels the cursor
// strongly only when it's right next to it; beyond ~500px it ignores it.
const CURSOR_NEAR = 60
const CURSOR_FAR  = 500
// Cap the cursor-to-gem direction magnitude. Without this, a cursor close
// to the gem creates a wildly large angle that defeats the "soft" feel.
const CURSOR_DIR_CAP = 240

const MINT = new THREE.Color('#6EE7B7')
const WARM = new THREE.Color('#FFE2B5')
const COOL_MINT = new THREE.Color('#A7F3D0')
const NEUTRAL = new THREE.Color('#F2FFF8')
const baseEmissiveColor = new THREE.Color('#0d4a36')
const completeEmissiveColor = new THREE.Color('#2fbf8a')

const computeGlassColor = () => NEUTRAL.clone().lerp(MINT, PARAMS.mintTint)
const computeKeyColor = () => MINT.clone().lerp(WARM, PARAMS.keyWarmth)

export type CrystalShape = 'icosahedron' | 'dodecahedron' | 'octahedron' | 'tetrahedron'

export interface CrystalConfig {
  /** DOM id matched against `data-crystal-slot` on the placeholder div. */
  id: string
  shape: CrystalShape
  /** Primary glyph engraved on the gem face. Brand uses 'V' (no morph). */
  glyph: GlyphName
}

interface DashboardCrystalsProps {
  gems: CrystalConfig[]
}

function makeGeometry(shape: CrystalShape): THREE.BufferGeometry {
  switch (shape) {
    case 'dodecahedron': return new THREE.DodecahedronGeometry(1, 0)
    case 'octahedron':   return new THREE.OctahedronGeometry(1, 0)
    case 'tetrahedron':  return new THREE.TetrahedronGeometry(1, 0)
    case 'icosahedron':
    default:             return new THREE.IcosahedronGeometry(1, 0)
  }
}

/** 5-layer mint glow stack baked into a 512² canvas. Exact recipe ported
 *  from SectionGem.makeGlyphTexture so engravings match the canonical
 *  welcome-page gem. */
function makeGlyphTexture(glyph: GlyphName): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 512; cv.height = 512
  const c = cv.getContext('2d')!
  c.lineCap = 'round'; c.lineJoin = 'round'
  const drawLayer = (color: string, w: number, blur: number) => {
    c.shadowColor = '#6EE7B7'
    c.shadowBlur = blur
    c.strokeStyle = color
    c.lineWidth = w
    GLYPHS[glyph](c)
  }
  drawLayer('rgba(110, 231, 183, 0.10)', 18, 90)
  drawLayer('rgba(110, 231, 183, 0.22)', 13, 52)
  drawLayer('rgba(167, 243, 208, 0.50)',  7, 26)
  drawLayer('rgba(196, 250, 220, 0.85)',  4, 12)
  drawLayer('rgba(240, 255, 245, 1.00)', 1.8, 4)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

type FaceData = { center: THREE.Vector3; normal: THREE.Vector3 }

/** Per-gem private state held in the registry. */
interface GemEntry {
  config: CrystalConfig
  slot: HTMLElement
  /** The .tile element containing this slot — used for per-tile cursor
   *  tilt (gem only responds to cursor when it's inside this tile). */
  tile: HTMLElement
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>
  vMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  texSection: THREE.CanvasTexture
  texBrand: THREE.CanvasTexture
  faces: FaceData[]
  restingFaceIdx: number
  restEuler: THREE.Euler
  baseEmissive: number
  // Per-gem morph + pulse state
  phase: number
  phaseStart: number
  idleDur: number
  pulseStart: number
  nextPulseAt: number
  // Per-gem Destiny-style jolt state (quick rotation pulse)
  joltStart: number
  nextJoltAt: number
  // Per-gem cursor tilt (only active while cursor is inside the tile)
  tiltX: number
  tiltY: number
  tiltTargetX: number
  tiltTargetY: number
  // Per-gem bob phase offset so 6 gems don't bob in unison
  bobOffset: number
}

const PHASE = {
  IDLE_SECTION: 0,
  GLITCH_TO_BRAND: 1,
  IDLE_BRAND: 2,
  GLITCH_TO_SECTION: 3,
} as const

// Bias toward the tile's own glyph: section holds 22-38s, V flashes for
// only 4-8s. So a viewer mostly sees the tile's glyph and the V mark
// punctuates as a brand reminder.
const MIN_SECTION_DUR = 22
const MAX_SECTION_DUR = 38
const MIN_BRAND_DUR = 4
const MAX_BRAND_DUR = 8
const GLITCH_DUR = 0.55
const PULSE_DUR = 1.5
const PULSE_SCALE_AMP = 0.04
const PULSE_EMISSIVE_AMP = 0.5
const ENV_LO = 0.82
const ENV_HI = 0.94

// Destiny-Ghost-style jolt: fast snap right, up, left, settle. Decaying
// oscillation so it reads as a "huh?" head-cock then return. Total ~0.55s.
const JOLT_DUR = 0.55
const JOLT_AMP = 0.18
const MIN_JOLT_INTERVAL = 8
const MAX_JOLT_INTERVAL = 16

const smoothstep = (lo: number, hi: number, x: number) => {
  const tt = Math.max(0, Math.min(1, (x - lo) / (hi - lo)))
  return tt * tt * (3 - 2 * tt)
}

const rollSectionDur = () => MIN_SECTION_DUR + Math.random() * (MAX_SECTION_DUR - MIN_SECTION_DUR)
const rollBrandDur   = () => MIN_BRAND_DUR   + Math.random() * (MAX_BRAND_DUR   - MIN_BRAND_DUR)
const rollNextPulse  = (now: number) => now + 20 + Math.random() * 25
const rollNextJolt   = (now: number) => now + MIN_JOLT_INTERVAL + Math.random() * (MAX_JOLT_INTERVAL - MIN_JOLT_INTERVAL)

/** Per-gem jolt pose. Decaying oscillation: snap one direction, swing
 *  back through center, smaller swing the other way, settle. Returns
 *  Euler delta in radians. */
function joltPose(localT: number): { dx: number; dy: number } {
  if (localT < 0 || localT > JOLT_DUR) return { dx: 0, dy: 0 }
  const t = localT / JOLT_DUR
  const decay = Math.exp(-3 * t)
  const dy = JOLT_AMP * decay * Math.cos(t * Math.PI * 3)
  const dx = JOLT_AMP * 0.55 * decay * Math.sin(t * Math.PI * 2.5)
  return { dx, dy }
}

export default function DashboardCrystals({ gems }: DashboardCrystalsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // The gem list is stable across the dashboard's lifetime so we capture
  // it once in a ref and avoid re-mounting the entire scene if the parent
  // re-renders with structurally-equal gems.
  const gemsRef = useRef<CrystalConfig[]>(gems)
  gemsRef.current = gems

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch (err) {
      console.warn('[DashboardCrystals] WebGL init failed, gems will not render.', err)
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.autoClear = false
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))

    /* ── Shared procedural PMREM env (one bake, used by every gem) ─
       Same painted canvas as SectionGem so reflections match the
       welcome-page V gem byte-for-byte. */
    const envCanvas = document.createElement('canvas')
    envCanvas.width = 1024; envCanvas.height = 512
    const ctx = envCanvas.getContext('2d')!
    ctx.fillStyle = '#0a1a18'; ctx.fillRect(0, 0, 1024, 512)
    const g1 = ctx.createRadialGradient(280, 170, 0, 280, 170, 520)
    g1.addColorStop(0, 'rgba(180,255,220,1)')
    g1.addColorStop(0.4, 'rgba(110,231,183,0.45)')
    g1.addColorStop(1, 'rgba(110,231,183,0)')
    ctx.fillStyle = g1; ctx.fillRect(0, 0, 1024, 512)
    const g2 = ctx.createRadialGradient(760, 200, 0, 760, 200, 500)
    g2.addColorStop(0, 'rgba(255,235,195,1)')
    g2.addColorStop(0.4, 'rgba(255,220,170,0.42)')
    g2.addColorStop(1, 'rgba(255,220,170,0)')
    ctx.fillStyle = g2; ctx.fillRect(0, 0, 1024, 512)
    const g3 = ctx.createRadialGradient(512, 470, 0, 512, 470, 380)
    g3.addColorStop(0, 'rgba(140,220,190,0.9)')
    g3.addColorStop(1, 'rgba(140,220,190,0)')
    ctx.fillStyle = g3; ctx.fillRect(0, 0, 1024, 512)
    const g4 = ctx.createRadialGradient(420, 90, 0, 420, 90, 80)
    g4.addColorStop(0, 'rgba(255,255,255,.85)')
    g4.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g4; ctx.fillRect(0, 0, 1024, 512)
    const envSource = new THREE.CanvasTexture(envCanvas)
    envSource.mapping = THREE.EquirectangularReflectionMapping
    envSource.colorSpace = THREE.SRGBColorSpace
    envSource.needsUpdate = true
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromEquirectangular(envSource).texture
    envSource.dispose()

    /* ── Build a gem entry: scene + mesh + faces + textures + state ── */
    function buildGem(cfg: CrystalConfig, slot: HTMLElement, bobOffset: number): GemEntry {
      const scene = new THREE.Scene()
      scene.environment = envTex

      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
      camera.position.set(0, 0.05, 4.6)
      camera.lookAt(0, 0, 0)

      const geo = makeGeometry(cfg.shape)
      const mat = new THREE.MeshPhysicalMaterial({
        color: computeGlassColor(),
        transmission: PARAMS.transmission,
        thickness: PARAMS.thickness,
        ior: PARAMS.ior,
        roughness: PARAMS.roughness,
        metalness: 0,
        attenuationColor: MINT.clone(),
        attenuationDistance: 1.0,
        clearcoat: 0.7,
        clearcoatRoughness: 0.04,
        envMapIntensity: 2.8,
        transparent: true,
        side: THREE.DoubleSide,
        emissive: baseEmissiveColor.clone(),
        emissiveIntensity: 0.5,
      })
      const baseEmissive = mat.emissiveIntensity
      const mesh = new THREE.Mesh(geo, mat)
      scene.add(mesh)

      const edgesGeo = new THREE.EdgesGeometry(geo, 1)
      const wireMat = new THREE.LineBasicMaterial({
        color: 0xa7f3d0, transparent: true, opacity: 0.7, depthTest: false,
      })
      const wire = new THREE.LineSegments(edgesGeo, wireMat)
      wire.renderOrder = 2
      wire.scale.setScalar(1.001)
      mesh.add(wire)

      // Per-gem lights (cheap; lets each gem read on its own dark background)
      scene.add(new THREE.AmbientLight(0x1a3a2c, 0.15))
      const key = new THREE.DirectionalLight(computeKeyColor().getHex(), 4.0)
      key.position.set(2.6, 1.8, 2.2); scene.add(key)
      const rim = new THREE.DirectionalLight(COOL_MINT.getHex(), 2.2)
      rim.position.set(-2.8, 1.2, -2.0); scene.add(rim)
      const fill = new THREE.DirectionalLight(0x88c4b0, 0.6)
      fill.position.set(0, -2.5, 1); scene.add(fill)

      /* Face detection: dedupe triangles by normal direction so a pentagon
         (dodecahedron) or polygon face is found as one entry, not 3-5. */
      const faces: FaceData[] = []
      const faceVerts: THREE.Vector3[][] = []
      const NORMAL_MATCH = 0.999
      const posAttr = geo.attributes.position
      for (let i = 0; i < posAttr.count; i += 3) {
        const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i)
        const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1)
        const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2)
        const normal = new THREE.Vector3()
          .subVectors(v1, v0)
          .cross(new THREE.Vector3().subVectors(v2, v0))
          .normalize()
        let matchIdx = -1
        for (let j = 0; j < faces.length; j++) {
          if (faces[j].normal.dot(normal) > NORMAL_MATCH) { matchIdx = j; break }
        }
        if (matchIdx >= 0) faceVerts[matchIdx].push(v0, v1, v2)
        else { faces.push({ center: new THREE.Vector3(), normal }); faceVerts.push([v0, v1, v2]) }
      }
      for (let i = 0; i < faces.length; i++) {
        const unique: THREE.Vector3[] = []
        for (const v of faceVerts[i]) {
          if (!unique.some((u) => u.distanceTo(v) < 1e-5)) unique.push(v)
        }
        const center = new THREE.Vector3()
        for (const v of unique) center.add(v)
        center.divideScalar(unique.length)
        faces[i].center = center
      }

      /* Glyph textures: section glyph + V. Brand tile uses V as primary
         so its "section" texture is also V — the morph degenerates into
         a no-op without breaking the loop. */
      const texSection = makeGlyphTexture(cfg.glyph)
      const texBrand   = makeGlyphTexture('V')

      const vMat = new THREE.MeshBasicMaterial({
        map: texSection, transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: true,
        side: THREE.FrontSide, opacity: 0,
      })
      const vGeo = new THREE.PlaneGeometry(0.62, 0.62)
      const vMesh = new THREE.Mesh(vGeo, vMat)
      vMesh.renderOrder = 3
      mesh.add(vMesh)

      /* Rest pose: pre-rotate so the most-front face is dead-on to the
         camera. The tick layers small bob + cursor tilt on top of this
         pose but the active face never changes, so the glyph stays
         visible throughout. */
      const CAMERA_DIR = new THREE.Vector3(0, 0, 1)
      let restingFaceIdx = 0
      let restingDot = -Infinity
      for (let i = 0; i < faces.length; i++) {
        const d = faces[i].normal.dot(CAMERA_DIR)
        if (d > restingDot) { restingDot = d; restingFaceIdx = i }
      }
      const restQuat = new THREE.Quaternion().setFromUnitVectors(
        faces[restingFaceIdx].normal.clone(),
        CAMERA_DIR,
      )
      const restEuler = new THREE.Euler().setFromQuaternion(restQuat, 'YXZ')
      mesh.rotation.set(restEuler.x, restEuler.y, restEuler.z)

      // Stagger the morph + pulse + jolt start times across gems so the
      // six don't glitch in lockstep at boot. The tile element is the
      // slot's parent (the .tile Link).
      const startNow = clock.getElapsedTime()
      const tile = (slot.parentElement as HTMLElement | null) ?? slot
      return {
        config: cfg,
        slot,
        tile,
        scene,
        camera,
        mesh,
        vMesh,
        texSection,
        texBrand,
        faces,
        restingFaceIdx,
        restEuler,
        baseEmissive,
        phase: PHASE.IDLE_SECTION,
        phaseStart: startNow - Math.random() * (MAX_SECTION_DUR - MIN_SECTION_DUR),
        idleDur: rollSectionDur(),
        pulseStart: -Infinity,
        nextPulseAt: startNow + 6 + Math.random() * 8,
        joltStart: -Infinity,
        nextJoltAt: startNow + 4 + Math.random() * 6,
        tiltX: 0,
        tiltY: 0,
        tiltTargetX: 0,
        tiltTargetY: 0,
        bobOffset: bobOffset,
      }
    }

    /* ── Scratch math objects, reused across frames ── */
    const _q = new THREE.Quaternion()
    const _e = new THREE.Euler()
    const _n = new THREE.Vector3()
    const _planeUp = new THREE.Vector3()
    const _desiredUp = new THREE.Vector3()
    const _cross = new THREE.Vector3()
    const _correct = new THREE.Quaternion()
    const _Y = new THREE.Vector3(0, 1, 0)
    const _Z = new THREE.Vector3(0, 0, 1)
    const CAMERA_DIR = new THREE.Vector3(0, 0, 1)

    function getFaceWorldDot(gem: GemEntry, idx: number): number {
      _e.set(gem.mesh.rotation.x, gem.mesh.rotation.y, gem.mesh.rotation.z)
      _q.setFromEuler(_e)
      _n.copy(gem.faces[idx].normal).applyQuaternion(_q)
      return _n.dot(CAMERA_DIR)
    }

    function placeOnFace(gem: GemEntry, idx: number) {
      const f = gem.faces[idx]
      gem.vMesh.position.copy(f.center).add(_n.copy(f.normal).multiplyScalar(0.012))
      gem.vMesh.quaternion.setFromUnitVectors(_Z, f.normal)
      _planeUp.copy(_Y).applyQuaternion(gem.vMesh.quaternion)
      _desiredUp.copy(_Y).sub(_n.copy(f.normal).multiplyScalar(_Y.dot(f.normal)))
      if (_desiredUp.lengthSq() < 1e-4) return
      _desiredUp.normalize()
      const cosA = _planeUp.dot(_desiredUp)
      _cross.crossVectors(_planeUp, _desiredUp)
      const sinA = _cross.dot(f.normal)
      const angle = Math.atan2(sinA, cosA)
      _correct.setFromAxisAngle(f.normal, angle)
      gem.vMesh.quaternion.premultiply(_correct)
    }

    /* ── Per-tile cursor tracking: gems only tilt toward the cursor when
         it's inside their own tile. Outside the tile, target is zero and
         the gem eases back to rest pose. Cursor position is tracked
         globally but each gem reads it through its own tile rect. ── */
    const cursor = { x: 0, y: 0, active: false }
    const handleMouse = (e: MouseEvent) => {
      cursor.x = e.clientX
      cursor.y = e.clientY
      cursor.active = true
    }
    const handleTouch = (e: TouchEvent) => {
      if (e.touches[0]) {
        cursor.x = e.touches[0].clientX
        cursor.y = e.touches[0].clientY
        cursor.active = true
      }
    }
    const handleLeave = () => { cursor.active = false }
    window.addEventListener('mousemove', handleMouse, { passive: true })
    window.addEventListener('touchmove', handleTouch, { passive: true })
    window.addEventListener('mouseleave', handleLeave, { passive: true })

    /* ── Resize handling: canvas matches its scroll container (the
         .shell that holds the tiles), not the viewport. Sizing to the
         scroll container means the canvas scrolls WITH the tiles, so
         gem positions stay glued to their slots without per-scroll
         math. With position:fixed on the canvas, browsers sometimes
         throttle the per-frame rect updates during scroll and the
         gems appear to detach. */
    const resize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
    }
    resize()
    const canvasResizeObserver = new ResizeObserver(resize)
    canvasResizeObserver.observe(canvas)
    window.addEventListener('resize', resize)

    /* ── Build gems: query slots from the DOM, create entries ──
       Slots are rendered as children of Dashboard before this useEffect
       runs, so querySelectorAll picks them up cleanly. */
    const clock = new THREE.Clock()
    const registry: GemEntry[] = []
    for (let i = 0; i < gemsRef.current.length; i++) {
      const cfg = gemsRef.current[i]
      const slot = document.querySelector<HTMLElement>(`[data-crystal-slot="${cfg.id}"]`)
      if (!slot) continue
      registry.push(buildGem(cfg, slot, i * 0.37))
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    /* ── Tick loop: clear once, then per gem set viewport + render ── */
    let rafId = 0
    function tick() {
      const t = clock.getElapsedTime()

      renderer.setScissorTest(false)
      renderer.clear()
      renderer.setScissorTest(true)

      // Canvas viewport rect — both the canvas and the slots are inside
      // the same scrolling container (.shell), so canvas-relative coords
      // are invariant under scroll. This is the fix for "gems detach from
      // tiles when scrolling". canvas is non-null here (top-of-useEffect
      // check returned early if it was), but TS loses narrowing across
      // the rAF closure, so the assertion makes that explicit.
      const canvasEl = canvas!
      const canvasRect = canvasEl.getBoundingClientRect()
      const ch = canvasEl.clientHeight

      for (const gem of registry) {
        const r = gem.slot.getBoundingClientRect()
        // Skip slots outside the canvas's current visible area.
        if (r.bottom < canvasRect.top || r.top > canvasRect.bottom ||
            r.right < canvasRect.left || r.left > canvasRect.right) continue
        if (r.width < 2 || r.height < 2) continue

        // Proximity-based cursor pull: each gem feels the cursor only when
        // it's nearby. Falloff with distance keeps far-away gems still and
        // makes the nearby ones turn just slightly toward the cursor. No
        // per-tile scoping needed — distance does the isolation naturally.
        if (cursor.active) {
          const gemCenterX = r.left + r.width / 2
          const gemCenterY = r.top + r.height / 2
          const dxCursor = cursor.x - gemCenterX
          const dyCursor = cursor.y - gemCenterY
          const dist = Math.sqrt(dxCursor * dxCursor + dyCursor * dyCursor)
          const strength = 1 - smoothstep(CURSOR_NEAR, CURSOR_FAR, dist)
          // Cap the direction magnitude so the gem doesn't snap hard when
          // cursor sits on top of it; otherwise the tilt overshoots the
          // intended "soft pull" feel.
          const denom = Math.max(CURSOR_DIR_CAP, dist)
          const nx = dxCursor / denom
          const ny = dyCursor / denom
          gem.tiltTargetX = ny * PARAMS.cursorTilt * strength
          gem.tiltTargetY = nx * PARAMS.cursorTilt * strength
        } else {
          gem.tiltTargetX = 0
          gem.tiltTargetY = 0
        }
        gem.tiltX += (gem.tiltTargetX - gem.tiltX) * PARAMS.spring
        gem.tiltY += (gem.tiltTargetY - gem.tiltY) * PARAMS.spring

        // Destiny-style jolt: if it's time, kick off a new one. The jolt
        // is a short decaying oscillation overlaid on the rest pose.
        if (t >= gem.nextJoltAt && t - gem.joltStart > JOLT_DUR) {
          gem.joltStart = t
          gem.nextJoltAt = rollNextJolt(t)
        }
        const jolt = joltPose(t - gem.joltStart)

        // Per-gem motion: rest pose + bob + per-tile cursor tilt + jolt
        const bx = Math.sin(t * 0.9 + gem.bobOffset) * PARAMS.wobbleAmplitude
        const by = Math.sin(t * 0.7 + gem.bobOffset + 0.5) * (PARAMS.wobbleAmplitude * 0.9)
        if (prefersReducedMotion) {
          gem.mesh.rotation.set(gem.restEuler.x, gem.restEuler.y, gem.restEuler.z)
        } else {
          gem.mesh.rotation.x = gem.restEuler.x + bx + gem.tiltX + jolt.dx
          gem.mesh.rotation.y = gem.restEuler.y + by + gem.tiltY + jolt.dy
          gem.mesh.rotation.z = gem.restEuler.z
        }

        placeOnFace(gem, gem.restingFaceIdx)
        const envSmooth = smoothstep(ENV_LO, ENV_HI, getFaceWorldDot(gem, gem.restingFaceIdx))

        // Idle pulse (heartbeat) scheduling
        if (t >= gem.nextPulseAt && t - gem.pulseStart > PULSE_DUR) {
          gem.pulseStart = t
          gem.nextPulseAt = rollNextPulse(t)
        }
        let pulseAmt = 0
        const pulseT = t - gem.pulseStart
        if (pulseT >= 0 && pulseT < PULSE_DUR) {
          const peak = PULSE_DUR / 2
          const raw = Math.max(0, 1 - Math.abs(pulseT - peak) / peak)
          pulseAmt = raw * raw * (3 - 2 * raw)
        }

        // Calm flicker baseline — slow micro oscillation + rare shallow dip
        const calmIdle = () => {
          const micro = 0.03 * Math.sin(t * 2.5 + gem.bobOffset)
          const blink = (Math.sin(t * 9 + gem.bobOffset) * Math.sin(t * 3)) > 0.94 ? -0.15 : 0
          return (0.95 + micro + blink) * envSmooth
        }

        // Morph state machine. Brand (glyph === 'V') uses both textures
        // as V so the morph is invisible; we still run the loop to keep
        // code paths uniform.
        const localT = t - gem.phaseStart
        let glyphOpacity = 0
        if (prefersReducedMotion) {
          gem.vMesh.material.map = gem.texSection
          glyphOpacity = 0.6
        } else if (gem.phase === PHASE.IDLE_SECTION) {
          gem.vMesh.material.map = gem.texSection
          glyphOpacity = calmIdle()
          if (localT > gem.idleDur) { gem.phase = PHASE.GLITCH_TO_BRAND; gem.phaseStart = t }
        } else if (gem.phase === PHASE.GLITCH_TO_BRAND) {
          const half = GLITCH_DUR / 2
          gem.vMesh.material.map = localT < half ? gem.texSection : gem.texBrand
          const strobe = Math.sin(t * 80) > 0 ? 1 : 0.15
          const ramp = 1 - Math.abs(localT - half) / half
          glyphOpacity = strobe * (0.4 + 0.6 * ramp) * envSmooth
          if (localT > GLITCH_DUR) {
            gem.phase = PHASE.IDLE_BRAND
            gem.phaseStart = t
            gem.idleDur = rollBrandDur()  // V holds briefly
          }
        } else if (gem.phase === PHASE.IDLE_BRAND) {
          gem.vMesh.material.map = gem.texBrand
          glyphOpacity = calmIdle()
          if (localT > gem.idleDur) { gem.phase = PHASE.GLITCH_TO_SECTION; gem.phaseStart = t }
        } else if (gem.phase === PHASE.GLITCH_TO_SECTION) {
          const half = GLITCH_DUR / 2
          gem.vMesh.material.map = localT < half ? gem.texBrand : gem.texSection
          const strobe = Math.sin(t * 80) > 0 ? 1 : 0.15
          const ramp = 1 - Math.abs(localT - half) / half
          glyphOpacity = strobe * (0.4 + 0.6 * ramp) * envSmooth
          if (localT > GLITCH_DUR) {
            gem.phase = PHASE.IDLE_SECTION
            gem.phaseStart = t
            gem.idleDur = rollSectionDur()  // section glyph holds long
          }
        }

        // Apply the heartbeat to scale + emissive + a small glyph bump
        gem.mesh.scale.setScalar(1 + PULSE_SCALE_AMP * pulseAmt)
        gem.mesh.material.emissiveIntensity = gem.baseEmissive + PULSE_EMISSIVE_AMP * pulseAmt
        gem.mesh.material.emissive.copy(baseEmissiveColor).lerp(completeEmissiveColor, 0.3 * pulseAmt)
        glyphOpacity += 0.08 * pulseAmt * envSmooth

        gem.vMesh.material.opacity = Math.max(0, Math.min(1, glyphOpacity))

        // Viewport + scissor in CSS px RELATIVE TO THE CANVAS — Three.js's
        // setViewport/setScissor multiply by pixelRatio internally, so we
        // MUST NOT do it ourselves. WebGL Y origin is bottom-left, flip
        // from browser top-left rect. Using canvas-relative coords keeps
        // the gems glued to their slots through scroll because canvas
        // and slots move together inside .shell.
        const x = r.left - canvasRect.left
        const y = ch - (r.top - canvasRect.top + r.height)
        const w = r.width
        const h = r.height
        renderer.setViewport(x, y, w, h)
        renderer.setScissor(x, y, w, h)
        gem.camera.aspect = r.width / r.height
        gem.camera.updateProjectionMatrix()
        renderer.render(gem.scene, gem.camera)
      }

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      canvasResizeObserver.disconnect()
      window.removeEventListener('mousemove', handleMouse)
      window.removeEventListener('touchmove', handleTouch)
      window.removeEventListener('mouseleave', handleLeave)
      window.removeEventListener('resize', resize)
      for (const gem of registry) {
        gem.mesh.geometry.dispose()
        gem.mesh.material.dispose()
        gem.vMesh.geometry.dispose()
        gem.vMesh.material.dispose()
        gem.texSection.dispose()
        gem.texBrand.dispose()
        // wire frame disposal — its EdgesGeometry + LineBasicMaterial
        // are children of mesh; iterate to dispose.
        gem.mesh.traverse((obj) => {
          if (obj instanceof THREE.LineSegments) {
            obj.geometry.dispose()
            if (obj.material instanceof THREE.Material) obj.material.dispose()
          }
        })
      }
      envTex.dispose()
      pmrem.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4,
      }}
      aria-hidden
    />
  )
}
