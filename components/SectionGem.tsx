'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLYPHS, ANIMATED_GLYPHS, ANIM_LOOP, DEFAULT_LOOP, type GlyphDraw, type GlyphName } from '@/lib/gemGlyphs'

/**
 * SectionGem — the hero V crystal, but engraved with a per-section glyph.
 *
 * Idle behavior: the glyph face crosses between the section mark (e.g.
 * `TALLY` for the workout logger) and the brand `V` every 3s, with a
 * 0.55s eased cross-fade (dims to invisible, swaps the texture at the
 * trough, eases back up — no strobe, so it never cuts).
 * Reads as "you're in this section, and it's part of Vitality."
 *
 * Completion behavior: when the `complete` prop flips truthy, the gem
 * glitches hard to `CHECK`, scales up to 1.08 + spikes mint emission,
 * holds for ~2.4s, then settles back into the idle morph loop.
 *
 * Engine: same vanilla Three.js setup as HeroCrystal (no R3F). Crystal
 * library architecture, but a private renderer per gem instead of the
 * shared-canvas pattern — this lets the gem live anywhere on the page
 * without a global canvas overlay. One gem per page is the intended use.
 *
 * Sizing: 3D crystal needs ≥240px to read. Default size 280px. Below
 * that, the glass goes muddy — use a flat SVG variant instead.
 */

const PARAMS = {
  rotationSpeed: 0.08,
  wobbleAmplitude: 0.10,
  cursorTilt: 0.18,
  spring: 0.06,
  mintTint: 0.12,
  roughness: 0.08,
  transmission: 0.82,
  thickness: 1.8,
  ior: 1.55,
  keyWarmth: 0.55,
}

const MINT = new THREE.Color('#6EE7B7')
const WARM = new THREE.Color('#FFE2B5')
const COOL_MINT = new THREE.Color('#A7F3D0')
const NEUTRAL = new THREE.Color('#F2FFF8')
const computeGlassColor = () => NEUTRAL.clone().lerp(MINT, PARAMS.mintTint)
const computeKeyColor = () => MINT.clone().lerp(WARM, PARAMS.keyWarmth)

interface SectionGemProps {
  /** Section glyph engraved on the gem. Pairs with V in the idle morph. */
  glyph: GlyphName
  /** When true, plays the completion sequence (glitch to CHECK + pulse). */
  complete?: boolean
  /** Polyhedron the gem is cut from. Dodecahedron's broad flat faces carry a
   *  bigger, cleaner engraving than the icosahedron's small triangles. */
  shape?: 'icosahedron' | 'dodecahedron' | 'octahedron' | 'tetrahedron'
  /** Multiplier on the engraved mark's size relative to the face. Default 1.
   *  Bump it to make the glyph read larger (e.g. the wide, low link mark). */
  glyphScale?: number
  /** Pixel size of the gem (CSS). 3D reads cleanly at ≥240. */
  size?: number
  /**
   * Where to position the gem.
   *   - 'absolute-top-right' (default) anchors the gem to the top-right
   *     of its containing block. Scrolls WITH the page — gem moves off-
   *     screen as the user scrolls down.
   *   - 'fixed-top-right' floats it in the viewport corner. Stays put as
   *     the page scrolls — heavier feel, can fight the content below.
   *   - 'inline' lets the parent control placement.
   */
  position?: 'absolute-top-right' | 'fixed-top-right' | 'inline'
  /** Top offset (px) when position='fixed-top-right'. Default 24. Nudge
   *  down to clear page chrome like a progress bar or step header. */
  top?: number
  /** Right offset (px) when position='fixed-top-right'. Default 24. */
  right?: number
  /** When true, gem ignores the cursor and holds its rotation pose. Use
   *  for small corner-accent placements where cursor-follow feels jittery. */
  staticPose?: boolean
  /** Optional className for the wrapper. */
  className?: string
}

export default function SectionGem({
  glyph,
  complete = false,
  shape = 'icosahedron',
  glyphScale = 1,
  size = 280,
  position = 'absolute-top-right',
  top = 24,
  right = 24,
  staticPose = false,
  className,
}: SectionGemProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const completeRef = useRef(complete)
  const staticPoseRef = useRef(staticPose)
  // Mirror the latest prop values into refs so the THREE loop reads them
  // without forcing a remount when they flip.
  useEffect(() => { completeRef.current = complete }, [complete])
  useEffect(() => { staticPoseRef.current = staticPose }, [staticPose])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch (err) {
      console.warn('[SectionGem] WebGL init failed.', err)
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
    camera.position.set(0, 0.05, 4.6)
    camera.lookAt(0, 0, 0)

    /* ── Procedural PMREM env (same painted canvas as HeroCrystal) ─ */
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
    scene.environment = envTex

    /* ── Geometry + glass material ──────────────────────────────── */
    const makeGeo = () => {
      switch (shape) {
        case 'dodecahedron': return new THREE.DodecahedronGeometry(1, 0)
        case 'octahedron':   return new THREE.OctahedronGeometry(1, 0)
        case 'tetrahedron':  return new THREE.TetrahedronGeometry(1, 0)
        default:             return new THREE.IcosahedronGeometry(1, 0)
      }
    }
    const geo = makeGeo()
    const baseEmissiveColor = new THREE.Color('#0d4a36')
    const completeEmissiveColor = new THREE.Color('#2fbf8a')
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

    /* ── Face detection (icosahedron — 20 triangles) ──────────── */
    type FaceData = { center: THREE.Vector3; normal: THREE.Vector3 }
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

    /* ── Glyph textures (section + V + CHECK) ─────────────────── */
    // Five-layer mint glow stack — the engraving look shared by every mark.
    const GLOW_LAYERS: [string, number, number][] = [
      ['rgba(110, 231, 183, 0.10)', 18, 90],
      ['rgba(110, 231, 183, 0.22)', 13, 52],
      ['rgba(167, 243, 208, 0.50)',  7, 26],
      ['rgba(196, 250, 220, 0.85)',  4, 12],
      ['rgba(240, 255, 245, 1.00)', 1.8, 4],
    ]
    const paintGlyph = (c: CanvasRenderingContext2D, draw: (c: CanvasRenderingContext2D) => void) => {
      c.lineCap = 'round'; c.lineJoin = 'round'
      for (const [color, w, blur] of GLOW_LAYERS) {
        c.shadowColor = '#6EE7B7'; c.shadowBlur = blur
        c.strokeStyle = color; c.lineWidth = w
        draw(c)
      }
      c.shadowBlur = 0
    }
    const makeGlyphTexture = (draw: GlyphDraw): THREE.CanvasTexture => {
      const cv = document.createElement('canvas')
      cv.width = 512; cv.height = 512
      const c = cv.getContext('2d')!
      paintGlyph(c, draw)
      const tex = new THREE.CanvasTexture(cv)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      tex.needsUpdate = true
      return tex
    }
    const texSection = makeGlyphTexture(GLYPHS[glyph])
    const texBrand   = makeGlyphTexture(GLYPHS.V)
    const texCheck   = makeGlyphTexture(GLYPHS.CHECK)

    /* ── Animated glyph (e.g. LINK) ────────────────────────────
       Some marks play a continuous loop instead of baking once. We keep a
       single canvas/texture and repaint it each frame the mark is visible,
       wrapped in the same glow stack. texSection stays the resting pose, so
       reduced-motion gracefully falls back to the static mark. */
    const animDraw = ANIMATED_GLYPHS[glyph] ?? null
    const loop = ANIM_LOOP[glyph] ?? DEFAULT_LOOP
    const animCanvas = animDraw ? document.createElement('canvas') : null
    const animCtx = animCanvas ? animCanvas.getContext('2d') : null
    let texAnim: THREE.CanvasTexture | null = null
    if (animCanvas && animCtx) {
      animCanvas.width = 512; animCanvas.height = 512
      texAnim = new THREE.CanvasTexture(animCanvas)
      texAnim.colorSpace = THREE.SRGBColorSpace
      texAnim.anisotropy = 4
    }
    const renderAnimFrame = (t01: number) => {
      if (!animCtx || !texAnim || !animDraw) return
      animCtx.clearRect(0, 0, 512, 512)
      paintGlyph(animCtx, (c) => animDraw(c, t01))
      texAnim.needsUpdate = true
    }

    const vMat = new THREE.MeshBasicMaterial({
      map: texSection, transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true,
      side: THREE.FrontSide, opacity: 0,
    })
    const vGeo = new THREE.PlaneGeometry(0.62 * glyphScale, 0.62 * glyphScale)
    const vMesh = new THREE.Mesh(vGeo, vMat)
    vMesh.renderOrder = 3
    mesh.add(vMesh)

    /* ── Face math (scratch objects reused across frames) ────── */
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
    const getFaceWorldDot = (idx: number) => {
      _e.set(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z)
      _q.setFromEuler(_e)
      _n.copy(faces[idx].normal).applyQuaternion(_q)
      return _n.dot(CAMERA_DIR)
    }
    const placeOnFace = (idx: number) => {
      const f = faces[idx]
      vMesh.position.copy(f.center).add(_n.copy(f.normal).multiplyScalar(0.012))
      vMesh.quaternion.setFromUnitVectors(_Z, f.normal)
      _planeUp.copy(_Y).applyQuaternion(vMesh.quaternion)
      _desiredUp.copy(_Y).sub(_n.copy(f.normal).multiplyScalar(_Y.dot(f.normal)))
      if (_desiredUp.lengthSq() < 1e-4) return
      _desiredUp.normalize()
      const cosA = _planeUp.dot(_desiredUp)
      _cross.crossVectors(_planeUp, _desiredUp)
      const sinA = _cross.dot(f.normal)
      const angle = Math.atan2(sinA, cosA)
      _correct.setFromAxisAngle(f.normal, angle)
      vMesh.quaternion.premultiply(_correct)
    }

    /* ── Lights ──────────────────────────────────────────────── */
    scene.add(new THREE.AmbientLight(0x1a3a2c, 0.15))
    const key = new THREE.DirectionalLight(computeKeyColor().getHex(), 4.0)
    key.position.set(2.6, 1.8, 2.2); scene.add(key)
    const rim = new THREE.DirectionalLight(COOL_MINT.getHex(), 2.2)
    rim.position.set(-2.8, 1.2, -2.0); scene.add(rim)
    const fill = new THREE.DirectionalLight(0x88c4b0, 0.6)
    fill.position.set(0, -2.5, 1); scene.add(fill)

    /* ── Rest pose ─────────────────────────────────────────────
       Pre-rotate the gem so the most-front face is locked dead-on
       toward the camera, then permanently engrave the glyph on that
       face. The tick loop layers small bobs and cursor tilt on top
       of this rest pose, but the active face never changes — the
       icon is always visible to the user (no claim/hold cycles, no
       face hopping). This mirrors HeroCrystal's character mode. */
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

    /* ── Sizing + resize observer ───────────────────────────── */
    const onResize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      renderer.setPixelRatio(dpr)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    onResize()
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(canvas)

    /* ── Cursor tilt (window-scoped — feels alive even when the gem
       is in the corner) ───────────────────────────────────────── */
    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }
    const onPointerMove = (clientX: number, clientY: number) => {
      const nx = (clientX / window.innerWidth) * 2 - 1
      const ny = (clientY / window.innerHeight) * 2 - 1
      target.x = ny * PARAMS.cursorTilt
      target.y = nx * PARAMS.cursorTilt
    }
    const handleMouse = (e: MouseEvent) => onPointerMove(e.clientX, e.clientY)
    const handleTouch = (e: TouchEvent) => {
      if (e.touches[0]) onPointerMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    window.addEventListener('mousemove', handleMouse, { passive: true })
    window.addEventListener('touchmove', handleTouch, { passive: true })

    /* ── Morph + completion state machine ─────────────────────
       Idle: hold section glyph for IDLE_DUR, then a GLITCH_DUR
       transition swaps to V. Hold V, glitch back. Loop.
       Complete: any → CHECK glitch + scale-pulse + emission spike.
       Hold CHECK for C_HOLD_DUR, then return → section glyph. */
    const PHASE = {
      IDLE_SECTION: 0, GLITCH_TO_BRAND: 1, IDLE_BRAND: 2, GLITCH_TO_SECTION: 3,
      COMPLETE_GLITCH: 4, COMPLETE_HOLD: 5, COMPLETE_RETURN: 6,
    } as const
    type Phase = typeof PHASE[keyof typeof PHASE]
    let phase: Phase = PHASE.IDLE_SECTION
    let phaseStart = 0
    let completeConsumed = false
    /* Active face is set once (to the resting face) and never changes
       — the glyph is always visible because that face stays dead-on. */
    let activeFaceIdx = -1

    /* Hold duration is randomized per IDLE phase to make the morph feel
       organic, not metronomic. Range chosen so the section ⇄ V swap
       happens roughly every 12–24s — slow enough that the user doesn't
       feel pestered by constant switching, fast enough that the morph
       is discoverable within a typical page visit. */
    const MIN_IDLE = 12
    const MAX_IDLE = 24
    const rollIdleDur = () => MIN_IDLE + Math.random() * (MAX_IDLE - MIN_IDLE)
    /* When the mark is animated (LINK), bias the morph hard toward the loop:
       hold the link for ~4 full loops, then a short flick to V (~80/20).
       Static marks keep the organic 12–24s ⇄ swap. */
    const LOOP_SECS = loop.period * loop.speed
    const rollSectionDur = () => (animDraw ? LOOP_SECS * (loop.holdLoops ?? 4) : rollIdleDur())
    const rollBrandDur = () => (animDraw ? (loop.brandHold ?? 1.8) : rollIdleDur())
    let idleDur = rollSectionDur()

    /* Random idle pulse — every 20-45s the gem briefly scales up +
       brightens its emissive, like a heartbeat. Half the magnitude of
       the completion celebration so it reads as ambient life, not a
       reward. Skipped while a completion sequence is running. */
    const PULSE_DUR = 1.4
    const PULSE_SCALE_AMP = 0.055
    const PULSE_EMISSIVE_AMP = 0.6
    const rollNextPulse = (now: number) => now + 2.2 + Math.random() * 3.6  // every ~2.2-5.8s
    let pulseStart = -Infinity
    let nextPulseAt = 1 + Math.random() * 2  // first pulse 1-3s after mount
    // Each burst rolls a fresh intensity so they don't feel metronomic — some
    // are a gentle breath, some a big excited bloom.
    let pulseMag = 1
    const rollPulseMag = () => 0.65 + Math.random() * 0.9  // 0.65-1.55

    /* ── Destiny-Ghost jolts ───────────────────────────────────
       Sporadic small, FAST rotational impulses that spring back to zero —
       the gem twitches and snaps, it doesn't tumble. This is what makes it
       read as an alive little companion rather than a slow-bobbing ornament. */
    const jolt = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }
    const JOLT_SPRING = 6.0  // higher = snappier return
    const JOLT_DAMP = 4.5
    let nextJoltAt = 0.6 + Math.random() * 1.0

    const GLITCH_DUR = 0.55
    // Animated marks cross-dissolve over their own (often longer) glitchDur.
    const ANIM_GLITCH = animDraw ? (loop.glitchDur ?? GLITCH_DUR) : GLITCH_DUR
    const C_GLITCH_DUR = 0.65
    const C_HOLD_DUR = 2.4

    const ENV_LO = 0.82, ENV_HI = 0.94
    const smoothstep = (lo: number, hi: number, x: number) => {
      const tt = Math.max(0, Math.min(1, (x - lo) / (hi - lo)))
      return tt * tt * (3 - 2 * tt)
    }

    /* ── Tick loop ──────────────────────────────────────────── */
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const clock = new THREE.Clock()
    let rafId = 0

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.05)
      const t = clock.getElapsedTime()

      if (prefersReducedMotion) {
        // Settle: face most-front, glyph at low opacity, no motion.
        let bestIdx = 0, bestDot = -Infinity
        for (let i = 0; i < faces.length; i++) {
          const d = getFaceWorldDot(i)
          if (d > bestDot) { bestDot = d; bestIdx = i }
        }
        placeOnFace(bestIdx)
        vMat.opacity = 0.45
        renderer.render(scene, camera)
        rafId = requestAnimationFrame(tick)
        return
      }

      /* Rest pose + gentle life. Gem doesn't continuously spin — that
         would carry the active face away from camera and force the
         glyph to fade or hop. Instead the resting face stays dead-on
         and we layer a small sin bob + cursor tilt on top so the gem
         reads alive without losing eye contact. */
      // Gentle drift baseline (two frequencies each), with the Ghost jolts
      // layered on top to carry the real liveliness.
      const bobX = Math.sin(t * 0.9) * 0.014 + Math.sin(t * 1.7 + 1.1) * 0.005
      const bobY = Math.sin(t * 0.7 + 0.5) * 0.012 + Math.sin(t * 1.3 + 2.0) * 0.004

      // Spring the jolt impulses back toward zero, then maybe fire a new one.
      jolt.vx += (-JOLT_SPRING * jolt.x - JOLT_DAMP * jolt.vx) * dt
      jolt.vy += (-JOLT_SPRING * jolt.y - JOLT_DAMP * jolt.vy) * dt
      jolt.vz += (-JOLT_SPRING * jolt.z - JOLT_DAMP * jolt.vz) * dt
      jolt.x += jolt.vx * dt
      jolt.y += jolt.vy * dt
      jolt.z += jolt.vz * dt
      if (t >= nextJoltAt) {
        // Small magnitudes — a twitch, not a tumble — but a fast kick.
        const mag = 0.05 + Math.random() * 0.08
        const sign = () => (Math.random() > 0.5 ? 1 : -1)
        jolt.vx += sign() * mag * 4
        jolt.vy += sign() * mag * 4
        jolt.vz += sign() * mag * 1.6
        nextJoltAt = t + 1.1 + Math.random() * 1.7
      }

      if (!staticPoseRef.current) {
        // Half-strength cursor follow — gem turns toward the user
        // without leaving rest pose. Without this halving the bob
        // gets swamped and the gem feels jittery.
        current.x += (target.x * 0.5 - current.x) * (PARAMS.spring * 0.7)
        current.y += (target.y * 0.5 - current.y) * (PARAMS.spring * 0.7)
      } else {
        current.x = 0
        current.y = 0
      }
      mesh.rotation.x = restEuler.x + bobX + jolt.x + current.x
      mesh.rotation.y = restEuler.y + bobY + jolt.y + current.y
      mesh.rotation.z = restEuler.z + jolt.z

      /* Persistent active face. The resting face computed at mount is
         always engraved. Glyph never blinks off — the envelope stays
         near 1 because the face is always dead-on. */
      if (activeFaceIdx < 0) activeFaceIdx = restingFaceIdx
      placeOnFace(activeFaceIdx)
      const envSmooth = smoothstep(ENV_LO, ENV_HI, getFaceWorldDot(activeFaceIdx))

      /* Completion trigger — edge-detect on the prop ref so each
         flip-to-true plays the sequence exactly once. */
      const isInCompletePhase =
        phase === PHASE.COMPLETE_GLITCH ||
        phase === PHASE.COMPLETE_HOLD ||
        phase === PHASE.COMPLETE_RETURN
      if (completeRef.current && !completeConsumed && !isInCompletePhase) {
        phase = PHASE.COMPLETE_GLITCH
        phaseStart = t
        completeConsumed = true
      } else if (!completeRef.current && completeConsumed && !isInCompletePhase) {
        // Re-arm when the parent flips complete back to false (allows
        // re-triggering on subsequent quiz steps).
        completeConsumed = false
      }

      /* Random idle pulse scheduling. Pulse only fires when no other
         pulse / completion sequence is mid-flight. After firing, roll
         a fresh interval (20-45s) for the next one. */
      if (!isInCompletePhase &&
          t >= nextPulseAt &&
          t - pulseStart > PULSE_DUR) {
        pulseStart = t
        pulseMag = rollPulseMag()
        nextPulseAt = rollNextPulse(t)
      }
      // Triangle envelope, eased — peaks at the middle of PULSE_DUR.
      let pulseAmt = 0
      const pulseT = t - pulseStart
      if (pulseT >= 0 && pulseT < PULSE_DUR) {
        const peak = PULSE_DUR / 2
        const raw = Math.max(0, 1 - Math.abs(pulseT - peak) / peak)
        pulseAmt = raw * raw * (3 - 2 * raw) // smoothstep
      }

      const localT = t - phaseStart
      let glyphOpacity = 0

      /* The section map: when the mark is animated, repaint the current loop
         frame and use it; otherwise the baked static texture. Repaint only
         when the section side is actually on-screen (saves the per-frame
         canvas cost while the V is showing). */
      const sectionMap = (): THREE.Texture => {
        if (animDraw && texAnim) {
          // Anchor the loop to when THIS section phase began, so the mark always
          // plays from its start (charge) when it appears — never mid-loop. One
          // loop = LOOP_SECS, so holdLoops loops fill the IDLE_SECTION window.
          const elapsed = Math.max(0, t - phaseStart)
          const t01 = (elapsed / LOOP_SECS) % 1
          renderAnimFrame(t01)
          return texAnim
        }
        return texSection
      }

      /* Calm idle flicker — slow micro oscillation (2.5Hz vs the old
         5.7Hz) and a rare, shallow dip (~3% of time, –0.15) instead of
         a frequent deep blink. Reads as candle-steady rather than a
         buzzing fluorescent. */
      const calmIdleOpacity = () => {
        const micro = 0.03 * Math.sin(t * 2.5)
        const blink = (Math.sin(t * 9) * Math.sin(t * 3)) > 0.94 ? -0.15 : 0
        return (0.95 + micro + blink) * envSmooth
      }

      if (phase === PHASE.IDLE_SECTION) {
        vMat.map = sectionMap()
        if (animDraw) {
          // Play the mark cleanly start→finish, fading IN at the open and OUT at
          // the close of the window, so it never cuts mid-loop. The next phase
          // then just brings the V up.
          const tail = Math.min(0.55, idleDur * 0.28)
          const fin = smoothstep(0, 1, localT / tail)
          const fout = 1 - smoothstep(0, 1, (localT - (idleDur - tail)) / tail)
          glyphOpacity = 0.95 * envSmooth * Math.min(fin, Math.max(0, fout))
        } else {
          glyphOpacity = calmIdleOpacity()
        }
        if (localT > idleDur) {
          phase = PHASE.GLITCH_TO_BRAND
          phaseStart = t
        }
      } else if (phase === PHASE.GLITCH_TO_BRAND) {
        const dur = animDraw ? ANIM_GLITCH : GLITCH_DUR
        const half = dur / 2
        if (animDraw) {
          // The mark already faded out at the end of its loop — just fade the V in.
          vMat.map = texBrand
          glyphOpacity = smoothstep(0, 1, localT / dur) * envSmooth
        } else {
          // Cross-fade through invisibility: dim the mark out, swap the texture
          // at the trough (opacity ~0, so the swap is unseen), ease the V back
          // up. No strobe, no mid-swap pop — it eases instead of cutting.
          const dip = smoothstep(0, 1, Math.abs(localT - half) / half)
          vMat.map = localT < half ? sectionMap() : texBrand
          glyphOpacity = 0.95 * envSmooth * dip
        }
        if (localT > dur) {
          phase = PHASE.IDLE_BRAND
          phaseStart = t
          idleDur = rollBrandDur()  // fresh hold for the V
        }
      } else if (phase === PHASE.IDLE_BRAND) {
        vMat.map = texBrand
        glyphOpacity = calmIdleOpacity()
        if (localT > idleDur) {
          phase = PHASE.GLITCH_TO_SECTION
          phaseStart = t
        }
      } else if (phase === PHASE.GLITCH_TO_SECTION) {
        const dur = animDraw ? ANIM_GLITCH : GLITCH_DUR
        const half = dur / 2
        if (animDraw) {
          // Fade the V out; the mark restarts from its beginning in IDLE_SECTION.
          vMat.map = texBrand
          glyphOpacity = (1 - smoothstep(0, 1, localT / dur)) * envSmooth
        } else {
          // Same eased cross-fade the other way: dim the V out, swap at the
          // trough, ease the section mark back up.
          const dip = smoothstep(0, 1, Math.abs(localT - half) / half)
          vMat.map = localT < half ? texBrand : sectionMap()
          glyphOpacity = 0.95 * envSmooth * dip
        }
        if (localT > dur) {
          phase = PHASE.IDLE_SECTION
          phaseStart = t
          idleDur = rollSectionDur()  // fresh hold for the section
        }
      } else if (phase === PHASE.COMPLETE_GLITCH) {
        const half = C_GLITCH_DUR / 2
        // Smooth dissolve into the check (the celebration's energy lives in the
        // scale + emissive burst below, not in a choppy glyph strobe).
        const cDip = smoothstep(0, 1, Math.abs(localT - half) / half)
        vMat.map = localT < half ? sectionMap() : texCheck
        glyphOpacity = 0.9 * envSmooth * cDip
        const k = Math.max(0, 1 - Math.abs(localT - half) / half)
        mesh.scale.setScalar(1 + 0.08 * k)
        mat.emissiveIntensity = baseEmissive + 1.6 * k
        mat.emissive.copy(baseEmissiveColor).lerp(completeEmissiveColor, k)
        if (localT > C_GLITCH_DUR) { phase = PHASE.COMPLETE_HOLD; phaseStart = t }
      } else if (phase === PHASE.COMPLETE_HOLD) {
        vMat.map = texCheck
        const w = (Math.sin(localT * 3.2) + 1) / 2
        const micro = 0.06 * Math.sin(t * 5.7)
        glyphOpacity = (0.86 + micro + 0.08 * w) * envSmooth
        const settle = Math.min(1, localT / 0.6)
        mesh.scale.setScalar(1 + 0.08 * (1 - settle) + 0.012 * w)
        mat.emissiveIntensity = baseEmissive + (1.6 * (1 - settle)) + 0.25 * w
        mat.emissive.copy(baseEmissiveColor).lerp(completeEmissiveColor, 0.4 * (1 - settle))
        if (localT > C_HOLD_DUR) { phase = PHASE.COMPLETE_RETURN; phaseStart = t }
      } else if (phase === PHASE.COMPLETE_RETURN) {
        const half = GLITCH_DUR / 2
        // Eased return from the check back to the section mark.
        const dip = smoothstep(0, 1, Math.abs(localT - half) / half)
        vMat.map = localT < half ? texCheck : sectionMap()
        glyphOpacity = 0.95 * envSmooth * dip
        if (localT > GLITCH_DUR) {
          phase = PHASE.IDLE_SECTION
          phaseStart = t
          mesh.scale.setScalar(1)
          mat.emissiveIntensity = baseEmissive
          mat.emissive.copy(baseEmissiveColor)
        }
      }

      /* Apply the random idle pulse to scale + emissive + a subtle
         glyph brightness bump. Skipped during completion phases (those
         own the scale/emissive state for the celebration). */
      if (!isInCompletePhase) {
        const pa = pulseAmt * pulseMag
        mesh.scale.setScalar(1 + PULSE_SCALE_AMP * pa)
        mat.emissiveIntensity = baseEmissive + PULSE_EMISSIVE_AMP * pa
        mat.emissive.copy(baseEmissiveColor).lerp(completeEmissiveColor, Math.min(0.45, 0.3 * pa))
        glyphOpacity += 0.08 * pa * envSmooth
      }

      // Animated link runs a touch dimmer than the V so its bright nodes
      // don't blow out the check drawing inside the right one.
      if (animDraw && vMat.map === texAnim) glyphOpacity *= 0.7
      vMat.opacity = Math.max(0, Math.min(1, glyphOpacity))

      renderer.render(scene, camera)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      window.removeEventListener('mousemove', handleMouse)
      window.removeEventListener('touchmove', handleTouch)
      mesh.removeFromParent()
      edgesGeo.dispose(); wireMat.dispose()
      vGeo.dispose(); vMat.dispose()
      texSection.dispose(); texBrand.dispose(); texCheck.dispose()
      texAnim?.dispose()
      geo.dispose(); mat.dispose()
      envTex.dispose(); pmrem.dispose()
      renderer.dispose()
    }
  }, [glyph, shape, glyphScale])

  const wrapperStyle: React.CSSProperties = (() => {
    // When a className is supplied the stylesheet owns size + position, which
    // lets the gem be made responsive (clamp()/media queries). Inline width/
    // height/offsets would beat those rules (inline > stylesheet) and the gem
    // would stay locked at `size` on every device — overflowing the header on
    // phones. So we hand sizing to CSS and only keep pointer-events off here.
    if (className) return { pointerEvents: 'none' }
    if (position === 'inline') return { width: size, height: size }
    const isFixed = position === 'fixed-top-right'
    return {
      position: isFixed ? 'fixed' : 'absolute',
      top,
      right,
      width: size,
      height: size,
      pointerEvents: 'none',
      zIndex: 30,
    }
  })()

  return (
    <div className={className} style={wrapperStyle} aria-hidden>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
