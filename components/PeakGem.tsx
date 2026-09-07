'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLYPHS } from '@/lib/gemGlyphs'

/**
 * PeakGem — the Peak section's signature crystal.
 *
 * Distinct from the shared SectionGem on purpose (Alex's call): Peak gets
 * its own gem language so the page feels like its own place.
 *   · Shape: octahedron (sharp double-pyramid — reads as a "peak"), unique
 *     to this page. Every other surface uses the icosahedron.
 *   · Motion: hero-style tumble around a tilted axis whose speed gently
 *     eases up and down (non-metronomic). The BOLT glyph (Peak's mark)
 *     rides whichever face is most exposed, flickering in as it turns
 *     toward the camera and out as it turns away. Mostly BOLT; roughly
 *     every 5th face-claim shows the brand V.
 *   · Surge: every ~22-36s a charge fires — emissive flare + scale-up +
 *     an expanding mint ring and a burst of energy sparks (DOM elements
 *     injected into the wrapper, animated via peak.module.css).
 *
 * Engine: same vanilla Three.js / painted-env setup as HeroCrystal +
 * SectionGem, private renderer per gem. Reads cleanly at >=140px.
 */

const PARAMS = {
  mintTint: 0.12, roughness: 0.08, transmission: 0.82, thickness: 1.8, ior: 1.55, keyWarmth: 0.55,
}
const MINT = new THREE.Color('#6EE7B7')
const WARM = new THREE.Color('#FFE2B5')
const COOL_MINT = new THREE.Color('#A7F3D0')
const NEUTRAL = new THREE.Color('#F2FFF8')
const glassColor = NEUTRAL.clone().lerp(MINT, PARAMS.mintTint)
const keyColor = MINT.clone().lerp(WARM, PARAMS.keyWarmth)

interface PeakGemProps {
  size?: number
  className?: string
}

export default function PeakGem({ size = 150, className }: PeakGemProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch (err) {
      console.warn('[PeakGem] WebGL init failed.', err)
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

    /* painted PMREM env (same recipe as HeroCrystal / SectionGem) */
    const ec = document.createElement('canvas'); ec.width = 1024; ec.height = 512
    const x = ec.getContext('2d')!
    x.fillStyle = '#0a1a18'; x.fillRect(0, 0, 1024, 512)
    const paint = (cx: number, cy: number, r: number, stops: [number, string][]) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r)
      stops.forEach(([o, c]) => g.addColorStop(o, c))
      x.fillStyle = g; x.fillRect(0, 0, 1024, 512)
    }
    paint(280, 170, 520, [[0, 'rgba(180,255,220,1)'], [0.4, 'rgba(110,231,183,0.45)'], [1, 'rgba(110,231,183,0)']])
    paint(760, 200, 500, [[0, 'rgba(255,235,195,1)'], [0.4, 'rgba(255,220,170,0.42)'], [1, 'rgba(255,220,170,0)']])
    paint(512, 470, 380, [[0, 'rgba(140,220,190,0.9)'], [1, 'rgba(140,220,190,0)']])
    paint(420, 90, 80, [[0, 'rgba(255,255,255,.85)'], [1, 'rgba(255,255,255,0)']])
    const envSrc = new THREE.CanvasTexture(ec)
    envSrc.mapping = THREE.EquirectangularReflectionMapping
    envSrc.colorSpace = THREE.SRGBColorSpace
    envSrc.needsUpdate = true
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromEquirectangular(envSrc).texture
    envSrc.dispose()
    scene.environment = envTex

    const geo = new THREE.OctahedronGeometry(1, 0)
    const baseEmissiveColor = new THREE.Color('#0d4a36')
    const completeEmissiveColor = new THREE.Color('#2fbf8a')
    const mat = new THREE.MeshPhysicalMaterial({
      color: glassColor, transmission: PARAMS.transmission, thickness: PARAMS.thickness, ior: PARAMS.ior,
      roughness: PARAMS.roughness, metalness: 0, attenuationColor: MINT.clone(), attenuationDistance: 1.0,
      clearcoat: 0.7, clearcoatRoughness: 0.04, envMapIntensity: 2.8, transparent: true,
      side: THREE.DoubleSide, emissive: baseEmissiveColor.clone(), emissiveIntensity: 0.5,
    })
    const baseEmissive = mat.emissiveIntensity
    const mesh = new THREE.Mesh(geo, mat)
    scene.add(mesh)

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 1),
      new THREE.LineBasicMaterial({ color: 0xa7f3d0, transparent: true, opacity: 0.7, depthTest: false }),
    )
    wire.renderOrder = 2; wire.scale.setScalar(1.001); mesh.add(wire)

    /* face detection */
    type FaceData = { center: THREE.Vector3; normal: THREE.Vector3 }
    const faces: FaceData[] = []
    const faceVerts: THREE.Vector3[][] = []
    const NM = 0.999
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i += 3) {
      const v0 = new THREE.Vector3().fromBufferAttribute(pos, i)
      const v1 = new THREE.Vector3().fromBufferAttribute(pos, i + 1)
      const v2 = new THREE.Vector3().fromBufferAttribute(pos, i + 2)
      const n = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize()
      let m = -1
      for (let j = 0; j < faces.length; j++) { if (faces[j].normal.dot(n) > NM) { m = j; break } }
      if (m >= 0) faceVerts[m].push(v0, v1, v2)
      else { faces.push({ center: new THREE.Vector3(), normal: n }); faceVerts.push([v0, v1, v2]) }
    }
    for (let i = 0; i < faces.length; i++) {
      const u: THREE.Vector3[] = []
      for (const v of faceVerts[i]) { if (!u.some(p => p.distanceTo(v) < 1e-5)) u.push(v) }
      const c = new THREE.Vector3(); u.forEach(v => c.add(v)); c.divideScalar(u.length); faces[i].center = c
    }

    const makeTex = (draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512
      const c = cv.getContext('2d')!; c.lineCap = 'round'; c.lineJoin = 'round'
      const L = (col: string, w: number, blur: number) => { c.shadowColor = '#6EE7B7'; c.shadowBlur = blur; c.strokeStyle = col; c.lineWidth = w; draw(c) }
      L('rgba(110,231,183,0.10)', 18, 90); L('rgba(110,231,183,0.22)', 13, 52); L('rgba(167,243,208,0.50)', 7, 26)
      L('rgba(196,250,220,0.85)', 4, 12); L('rgba(240,255,245,1.00)', 1.8, 4)
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true
      return t
    }
    const texSection = makeTex(GLYPHS.BOLT)
    const texBrand = makeTex(GLYPHS.V)

    const vMat = new THREE.MeshBasicMaterial({
      map: texSection, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true, side: THREE.FrontSide, opacity: 0,
    })
    const vMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), vMat); vMesh.renderOrder = 3; mesh.add(vMesh)

    const _n = new THREE.Vector3(), _pu = new THREE.Vector3(), _du = new THREE.Vector3(),
      _cr = new THREE.Vector3(), _cor = new THREE.Quaternion(),
      _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), CDIR = new THREE.Vector3(0, 0, 1)
    const faceDot = (i: number) => { _n.copy(faces[i].normal).applyQuaternion(mesh.quaternion); return _n.dot(CDIR) }
    const placeOnFace = (i: number) => {
      const f = faces[i]
      vMesh.position.copy(f.center).add(_n.copy(f.normal).multiplyScalar(0.012))
      vMesh.quaternion.setFromUnitVectors(_Z, f.normal)
      _pu.copy(_Y).applyQuaternion(vMesh.quaternion)
      _du.copy(_Y).sub(_n.copy(f.normal).multiplyScalar(_Y.dot(f.normal)))
      if (_du.lengthSq() < 1e-4) return
      _du.normalize()
      const cosA = _pu.dot(_du); _cr.crossVectors(_pu, _du); const sinA = _cr.dot(f.normal)
      _cor.setFromAxisAngle(f.normal, Math.atan2(sinA, cosA)); vMesh.quaternion.premultiply(_cor)
    }

    scene.add(new THREE.AmbientLight(0x1a3a2c, 0.15))
    const k = new THREE.DirectionalLight(keyColor.getHex(), 4.0); k.position.set(2.6, 1.8, 2.2); scene.add(k)
    const rm = new THREE.DirectionalLight(COOL_MINT.getHex(), 2.2); rm.position.set(-2.8, 1.2, -2.0); scene.add(rm)
    const fl = new THREE.DirectionalLight(0x88c4b0, 0.6); fl.position.set(0, -2.5, 1); scene.add(fl)

    /* tilted-axis tumble with eased ebb/flow speed */
    const SPIN_AXIS = new THREE.Vector3(0.34, 1, 0.16).normalize()
    const SPIN_BASE = 0.25, SPIN_VAR = 0.14
    let spinSpeed = SPIN_BASE
    const _spin = new THREE.Quaternion()
    mesh.quaternion.setFromAxisAngle(SPIN_AXIS, Math.random() * Math.PI * 2)

    /* face-claim flicker cycle (mostly BOLT, V ~1 in 5) */
    const FADE_IN_DUR = 0.5, HOLD_DUR = 2.2, FADE_OUT_DUR = 0.5
    const CYCLE_DUR = FADE_IN_DUR + HOLD_DUR + FADE_OUT_DUR
    const CLAIM_DOT = 0.86
    let activeFace = -1, cycleStart = 0, cycleComplete = true, flickPat = 0, claimCount = 0
    const HOLD_FLICKERS = [
      (t: number, s: number) => 0.86 + 0.10 * Math.sin(t * 7 + s) + (Math.sin(t * 19 + s * 2) > 0.85 ? -0.45 : 0),
      (t: number, s: number) => 0.84 + 0.14 * Math.sin(t * 5.2 + s) * Math.sin(t * 2.1 + s * 0.5),
      (t: number, s: number) => 0.94 + (Math.sin(t * 23 + s) * Math.sin(t * 11 + s * 0.3) > 0.65 ? -0.55 : 0),
      (t: number, s: number) => 0.90 + 0.07 * Math.sin(t * 2.0 + s),
    ]

    const PULSE_DUR = 1.5, PULSE_SCALE = 0.04, PULSE_EM = 0.5
    let pulseStart = -Infinity, nextPulse = 6 + Math.random() * 8

    const ENV_LO = 0.82, ENV_HI = 0.94
    const smooth = (lo: number, hi: number, v: number) => { const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); return t * t * (3 - 2 * t) }
    const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    /* surge — DOM ring + sparks injected into the wrapper */
    let surgeStart = -Infinity, nextSurge = 11 + Math.random() * 8
    const SURGE_DUR = 1.4
    const fireSurge = () => {
      if (prm) return
      const ring = document.createElement('div')
      ring.className = 'pk-surge-ring'
      ring.addEventListener('animationend', () => ring.remove())
      wrap.appendChild(ring)
      for (let i = 0; i < 13; i++) {
        const sp = document.createElement('div')
        sp.className = 'pk-spark'
        const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 52
        sp.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px')
        sp.style.setProperty('--dy', (Math.sin(ang) * dist - 14).toFixed(1) + 'px')
        sp.style.animationDelay = (Math.random() * 0.09).toFixed(2) + 's'
        sp.addEventListener('animationend', () => sp.remove())
        wrap.appendChild(sp)
      }
    }

    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
      renderer.setSize(w, h, false)
      camera.aspect = w / h; camera.updateProjectionMatrix()
    }
    onResize()
    const ro = new ResizeObserver(onResize); ro.observe(canvas)

    const clock = new THREE.Clock()
    let elapsed = 0
    let rafId = 0

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.05)
      elapsed += dt; const t = elapsed

      if (prm) {
        let bi = 0, bd = -Infinity
        for (let i = 0; i < faces.length; i++) { const d = faceDot(i); if (d > bd) { bd = d; bi = i } }
        placeOnFace(bi); vMat.opacity = 0.5
        renderer.render(scene, camera); rafId = requestAnimationFrame(tick); return
      }

      const targetSpeed = SPIN_BASE + SPIN_VAR * (0.62 * Math.sin(t * 0.16) + 0.38 * Math.sin(t * 0.33 + 1.3))
      spinSpeed += (targetSpeed - spinSpeed) * 0.025
      _spin.setFromAxisAngle(SPIN_AXIS, spinSpeed * dt)
      mesh.quaternion.multiply(_spin)

      if (t >= nextPulse && t - pulseStart > PULSE_DUR) { pulseStart = t; nextPulse = t + 20 + Math.random() * 25 }
      let pulse = 0; const pt = t - pulseStart
      if (pt >= 0 && pt < PULSE_DUR) { const pk = PULSE_DUR / 2; const r = Math.max(0, 1 - Math.abs(pt - pk) / pk); pulse = r * r * (3 - 2 * r) }

      if (t >= nextSurge && t - surgeStart > SURGE_DUR) { surgeStart = t; nextSurge = t + 22 + Math.random() * 14; fireSurge() }
      let surge = 0; const su = t - surgeStart
      if (su >= 0 && su < SURGE_DUR) { const a = su < 0.22 ? su / 0.22 : Math.max(0, 1 - (su - 0.22) / (SURGE_DUR - 0.22)); surge = a * a * (3 - 2 * a) }

      if (cycleComplete) {
        let bi = -1, bd = -Infinity
        for (let i = 0; i < faces.length; i++) { if (i === activeFace) continue; const d = faceDot(i); if (d > bd) { bd = d; bi = i } }
        if (bi >= 0 && bd >= CLAIM_DOT) {
          activeFace = bi; cycleStart = t; cycleComplete = false; flickPat = bi % HOLD_FLICKERS.length
          claimCount++; vMat.map = (claimCount % 5 === 0) ? texBrand : texSection
        }
      }
      if (activeFace >= 0) placeOnFace(activeFace)

      let cycleOp = 0
      if (!cycleComplete) {
        const c = t - cycleStart
        if (c < FADE_IN_DUR) { const ramp = c / FADE_IN_DUR; const fk = 0.55 + 0.45 * Math.abs(Math.sin(t * 11 + flickPat)); cycleOp = ramp * fk }
        else if (c < FADE_IN_DUR + HOLD_DUR) { cycleOp = HOLD_FLICKERS[flickPat](t, flickPat) }
        else if (c < CYCLE_DUR) { const off = (c - FADE_IN_DUR - HOLD_DUR) / FADE_OUT_DUR; const st = Math.sin(t * 38 + flickPat) > -0.4 ? 1 : 0.1; cycleOp = (1 - off) * st }
        else { cycleComplete = true; cycleOp = 0 }
      }
      const env = activeFace >= 0 ? smooth(ENV_LO, ENV_HI, faceDot(activeFace)) : 0
      let op = cycleOp * env

      if (surge > 0.02) { vMat.map = texSection; op = Math.max(op, surge * env) }
      mesh.scale.setScalar(1 + PULSE_SCALE * pulse + 0.08 * surge)
      mat.emissiveIntensity = baseEmissive + PULSE_EM * pulse + 1.6 * surge
      mat.emissive.copy(baseEmissiveColor).lerp(completeEmissiveColor, Math.min(1, 0.3 * pulse + 0.85 * surge))
      op += 0.08 * pulse * env + 0.45 * surge * env

      vMat.opacity = Math.max(0, Math.min(1, op))
      renderer.render(scene, camera)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      wrap.querySelectorAll('.pk-surge-ring, .pk-spark').forEach(el => el.remove())
      mesh.removeFromParent()
      geo.dispose(); mat.dispose(); vMat.dispose()
      texSection.dispose(); texBrand.dispose()
      envTex.dispose(); pmrem.dispose(); renderer.dispose()
    }
  }, [])

  return (
    <div ref={wrapRef} className={className} style={{ width: size, height: size, position: 'relative' }} aria-hidden>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', position: 'relative', zIndex: 2 }} />
    </div>
  )
}
