import dynamic from 'next/dynamic'
import styles from './landing.module.css'
import LandingParticles from '@/components/LandingParticles'
import HeroPhones from '@/components/HeroPhones'
import HeroTrendLightning from '@/components/HeroTrendLightning'

/**
 * Landing — v1 of the editorial crystal hero.
 *
 * The Three.js scene lives in <HeroCrystal /> and is lazy-loaded with
 * `ssr: false` so the ~150 KB gzipped Three.js bundle splits off the
 * critical path. The page server-renders everything else (chrome, captions,
 * text, mountains SVG, atmosphere) so the first paint never depends on JS.
 *
 * Page composition:
 *   <main>
 *     <section.hero>     ← the gem (100vh, self-clipped)
 *   </main>
 */

const HeroCrystal = dynamic(() => import('@/components/HeroCrystal'), {
  ssr: false,
})

export default function HomePage() {
  return (
    <main>
      <section className={styles.hero} data-screen-label="01 Hero">
      {/* Atmosphere layers (CSS-only) */}
      <div className={styles.aurora} aria-hidden />

      {/* Mountains horizon */}
      <div className={styles.mountains} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mt-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%"  stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="mt-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%"  stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z"
            fill="url(#mt-far)"
          />
          <path
            d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z"
            fill="url(#mt-near)"
          />
        </svg>
      </div>

      {/* Mist band */}
      <div className={styles.mist} aria-hidden />

      {/* Trend lightning — subtle mint sparkline strikes in the
          background (one from bottom-left up-right, one from bottom-
          right up-left, staggered so the viewer catches them one at
          a time). Sits at z=2 so it lives behind the crystal/phones/
          text but in front of the atmosphere. */}
      <HeroTrendLightning />

      {/* Crystal canvas (lazy-loaded Three.js).
          data-gem is the hover trigger zone for <HeroPhones />. */}
      <div className={styles.crystalStage} data-gem="crystal">
        <HeroCrystal />
        <div className={styles.fallback} aria-hidden>
          <svg viewBox="-1.2 -1.2 2.4 2.4">
            <defs>
              <linearGradient id="ico-fill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stopColor="#A7F3D0" />
                <stop offset="100%" stopColor="#3a8a6a" />
              </linearGradient>
            </defs>
            <polygon
              points="0,-1 0.95,-0.31 0.59,0.81 -0.59,0.81 -0.95,-0.31"
              fill="url(#ico-fill)"
              stroke="#6EE7B7"
              strokeWidth=".01"
              strokeOpacity=".4"
            />
          </svg>
        </div>
      </div>

      {/* Particles (drifting upward) */}
      <LandingParticles />

      {/* Flanking phone mockups — dashboard left, workout logger right.
          Hidden below 1100px so the v1 single-object hero still works on
          narrow viewports. */}
      <HeroPhones />

      {/* Top chrome */}
      <nav className={styles.chrome}>
        <a className={styles.wordmark} href="/">Vitality</a>
        <div className={styles.nav}>
          <a href="/pricing">pricing</a>
          <a className={styles.signIn} href="/login">Sign in</a>
        </div>
      </nav>

      {/* Museum-tag captions flanking the crystal */}
      <aside className={`${styles.caption} ${styles.captionLeft}`} aria-label="Product metadata">
        <span className={styles.captionNum}>$15 / month &nbsp;·&nbsp; no ads</span>
        <div className={styles.captionTitle}>A personal dashboard</div>
        <div className={styles.captionMeta}>Built around your goals.<br />Missing a tile? Your AI makes it.</div>
        <div className={styles.captionRule} />
      </aside>

      <aside className={`${styles.caption} ${styles.captionRight}`} aria-label="Studio metadata">
        <span className={styles.captionNum}>Vitality Studio &nbsp;·&nbsp; MMXXVI</span>
        <div className={styles.captionTitle}>Built by twins</div>
        <div className={styles.captionMeta}>From a YouTube channel.<br />Cancel anytime.</div>
        <div className={styles.captionRule} />
      </aside>

      {/* Heading above crystal */}
      <div className={styles.textTop}>
        <div className={styles.eyebrow}>Spring &middot; MMXXVI &middot; A Life In Order</div>
        <h1 className={styles.headline}>
          Your life, in <em>order</em>.
        </h1>
      </div>

      {/* Sub + CTA below crystal */}
      <div className={styles.textBottom}>
        <p className={styles.sub}>
          A study in restraint. Whatever you track, every pattern held in light. And when a tile you need doesn&rsquo;t exist, your AI builds it.
        </p>
        <a className={styles.cta} href="/signup">
          Start your dashboard <span className={styles.arrow}>→</span>
        </a>
        <div>
          <a className={styles.altSignIn} href="/login">Already a member?<em>Sign in</em></a>
        </div>
      </div>

      </section>
    </main>
  )
}
