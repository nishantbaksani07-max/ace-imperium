import dynamic from 'next/dynamic'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'

import ConnectorDemo from './ConnectorDemo'
import ConnectorPanel from './ConnectorPanel'
import InputSources from './InputSources'
import PricingCta from './PricingCta'
import VeeNotice from './VeeNotice'
import styles from './pricing.module.css'

/**
 * Pricing — single-tier, $15/mo. "Focus" layout: the price is the hero.
 * One atmospheric gem moment, one price card front and centre, then a
 * tight scannable "what's included", the founder's-pricing lock-in, a
 * short FAQ, and the closer. Restraint over sprawl — the whole page is
 * one confident object, the same dark + mint + Instrument Serif voice as
 * the landing so the funnel reads as one continuous publication.
 *
 * Page composition:
 *   <main>
 *     <section.offer>     ← gem + headline + price card (the anchor)
 *     <section.included>  ← 4-line included list + founder's-pricing line
 *     <section.closer>    ← final price card + FAQ + indie footer
 *   </main>
 */

const HeroCrystal = dynamic(() => import('@/components/HeroCrystal'), {
  ssr: false,
})

const HeroTrendLightning = dynamic(
  () => import('@/components/HeroTrendLightning'),
)

export const metadata = {
  title: 'Pricing · Vitality',
  description:
    '$15 a month. One price. Cancel anytime. The same dashboard we open every morning, now in your pocket.',
}

// Crisp engraved check used in the price-card bullets. currentColor is
// the mint set on .priceCheck, so it stays on-brand without an emoji.
function Check() {
  return (
    <svg
      className={styles.priceCheckSvg}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 6.5 5 9.5 10 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default async function PricingPage() {
  // Branch the CTA based on session + tier so authed users skip the
  // signup detour and pro users land in the portal instead of starting
  // a second subscription.
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isPro = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', user.id)
      .maybeSingle()
    isPro = profile?.tier === 'pro'
  }
  const isAuthed = Boolean(user)
  const ctaLabel = isPro ? 'Manage subscription' : 'Start your dashboard'

  return (
    <main className={styles.page} data-screen-label="Pricing">
      {/* ───────── Zone 1 — The offer (price is the hero) ─────────── */}
      <section className={styles.offer} aria-labelledby="offer-heading">
        <div className={styles.atmosphere} aria-hidden />
        <HeroTrendLightning />

        {/* Top chrome — wordmark + back link */}
        <nav className={styles.chrome}>
          <Link className={styles.wordmark} href="/">
            Vitality
          </Link>
          <div className={styles.nav}>
            <Link href="/">landing</Link>
            <a href="#included">what&apos;s in it</a>
            <Link className={styles.navMeta} href="/login">
              sign in ↗
            </Link>
          </div>
        </nav>

        {/* The gem — the landing's icosahedron, centred above the price as
            the single atmospheric moment. Live Three.js, SVG-masked so it
            melts into the black. */}
        <div className={styles.offerGem} aria-hidden>
          <HeroCrystal />
        </div>

        {/* Eyebrow + display headline */}
        <header className={styles.offerHeader}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowRule} />
            Membership · One price · No tiers
          </div>
          <h1 id="offer-heading" className={styles.headline}>
            <em>Fifteen</em> dollars
            <br />a month.
          </h1>
          <p className={styles.sub}>
            The same dashboard we open every morning.
            <br />
            Now it opens for you too.
          </p>
        </header>

        {/* Pricing card — the visual anchor */}
        <div className={styles.priceCard}>
          <div className={styles.priceTopRow}>
            <span className={styles.priceTopLabel}>Vitality membership</span>
            <span className={styles.priceTopMark}>·01</span>
          </div>

          <div className={styles.priceFigure}>
            <span className={styles.priceCurrency}>$</span>
            <span className={styles.priceAmount}>15</span>
            <span className={styles.priceUnit}>
              <span className={styles.priceUnitTop}>/month</span>
              <span className={styles.priceUnitBottom}>billed monthly</span>
            </span>
          </div>

          <ul className={styles.priceBullets}>
            <li>
              <span className={styles.priceCheck} aria-hidden>
                <Check />
              </span>
              Everything in v1, all included
            </li>
            <li>
              <span className={styles.priceCheck} aria-hidden>
                <Check />
              </span>
              Every new module ships to you free
            </li>
            <li>
              <span className={styles.priceCheck} aria-hidden>
                <Check />
              </span>
              Your data exports as JSON, anytime
            </li>
          </ul>

          <PricingCta isAuthed={isAuthed} isPro={isPro}>
            {ctaLabel} <span className={styles.priceCtaArrow}>→</span>
          </PricingCta>

          <p className={styles.priceFinePrint}>
            Cancel anytime · 30-day money-back guarantee
          </p>
        </div>
      </section>

      {/* ───────── Zone 1.5 — Your Claude, with a memory (the MCP value) ── */}
      <section id="claude" className={styles.claude} aria-labelledby="claude-heading">
        <header className={styles.sectionHead}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowRule} />
            A Claude connector
          </div>
          <h2 id="claude-heading" className={styles.sectionHeadline}>
            Claude forgets you. <em>Vitality remembers.</em>
          </h2>
          <p className={styles.sectionSub}>
            Vitality is your input device. Connect it once and Claude knows your
            sleep, your training, your money — all of it. Then just ask, the way
            Tony asks Vee.
          </p>
        </header>

        {/* IT'S A CONNECTOR — Vitality shown live in Claude's connector list. */}
        <ConnectorPanel />

        {/* WHAT GOES IN — the modules, each clickable to preview in the app. */}
        <InputSources />

        {/* THE PROOF — your app (laptop, the Vee notice) beside Claude (phone,
            connected), so you see input and brain side by side. */}
        <div className={styles.deviceScene}>
          <VeeNotice />
          <div className={styles.devicePhone}>
            <ConnectorDemo />
          </div>
        </div>

        {/* HOW IT CONNECTS — a quiet 3-step strip so it's unmistakable this
            is a Claude connector. */}
        <div className={styles.connect}>
          <ol className={styles.connectSteps}>
            <li>
              <span className={styles.stepNum}>01</span> Subscribe to Vitality
            </li>
            <li>
              <span className={styles.stepNum}>02</span> Add Vitality in
              Claude&apos;s connectors
            </li>
            <li>
              <span className={styles.stepNum}>03</span> Ask Claude anything
            </li>
          </ol>
          <p className={styles.connectFoot}>
            One connector · Works in Claude on web, desktop &amp; mobile
          </p>
        </div>
      </section>

      {/* ───────── Zone 2 — What you actually get (trimmed) ───────── */}
      <section
        id="included"
        className={styles.included}
        aria-labelledby="included-heading"
      >
        <header className={styles.sectionHead}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowRule} />
            What&apos;s included
          </div>
          <h2 id="included-heading" className={styles.sectionHeadline}>
            Everything in your <em>dashboard</em>.
          </h2>
          <p className={styles.sectionSub}>
            v1 starts with the workout logger, fully built. Every new module
            ships into your subscription the moment it&apos;s ready.
          </p>
        </header>

        <div className={styles.inclList}>
          <details className={styles.inclItem}>
            <summary className={styles.inclSummary}>
              <span className={styles.inclNum}>01</span>
              <span className={styles.inclTitle}>Workout logger</span>
              <span className={styles.inclChevron} aria-hidden />
            </summary>
            <p className={styles.inclBody}>
              200+ exercises, a progressive-overload graph, splits tailored to
              you, partial-rep logging, and an adjustable rest timer.
            </p>
          </details>
          <details className={styles.inclItem}>
            <summary className={styles.inclSummary}>
              <span className={styles.inclNum}>02</span>
              <span className={styles.inclTitle}>Tailored to you</span>
              <span className={styles.inclChevron} aria-hidden />
            </summary>
            <p className={styles.inclBody}>
              A short setup generates your starting weight for every lift,
              machine, and accessory. Travel-mode swaps any missing equipment.
            </p>
          </details>
          <details className={styles.inclItem}>
            <summary className={styles.inclSummary}>
              <span className={styles.inclNum}>03</span>
              <span className={styles.inclTitle}>Every future module</span>
              <span className={styles.inclChevron} aria-hidden />
            </summary>
            <p className={styles.inclBody}>
              Wearables, nutrition, finance, goals. Each one lands in your
              subscription as we ship it. No upsell, no add-on tiers.
            </p>
          </details>
          <details className={styles.inclItem}>
            <summary className={styles.inclSummary}>
              <span className={styles.inclNum}>04</span>
              <span className={styles.inclTitle}>Your data is yours</span>
              <span className={styles.inclChevron} aria-hidden />
            </summary>
            <p className={styles.inclBody}>
              Export everything as JSON in one tap, any time. We never sell it
              and we never train on it.
            </p>
          </details>
        </div>

        <p className={styles.lockIn}>
          <span className={styles.lockInLabel}>Founder&apos;s pricing.</span> $15
          a month right now. The price may rise as we add modules. Join today
          and you keep $15 for as long as your subscription stays active.
        </p>
      </section>

      {/* ───────── Zone 3 — Closer (FAQ dropdowns only; one CTA up top) ── */}
      <section className={styles.closer} aria-labelledby="closer-heading">
        <h2 id="closer-heading" className={styles.faqHeading}>
          Good to know.
        </h2>

        {/* FAQ — collapsed by default, minimal */}
        <div className={styles.faq}>
          <details className={styles.faqItem}>
            <summary className={styles.faqQ}>
              Is my data mine?
              <span className={styles.faqChevron} aria-hidden />
            </summary>
            <p className={styles.faqA}>
              Always. Export the whole thing as JSON any time. We don&apos;t
              sell it, we don&apos;t train on it, we don&apos;t share it.
            </p>
          </details>

          <details className={styles.faqItem}>
            <summary className={styles.faqQ}>
              What if I cancel?
              <span className={styles.faqChevron} aria-hidden />
            </summary>
            <p className={styles.faqA}>
              Cancel anytime from your account settings, one tap. Refund within
              30 days if you change your mind, no questions asked.
            </p>
          </details>

          <details className={styles.faqItem}>
            <summary className={styles.faqQ}>
              Are there usage limits?
              <span className={styles.faqChevron} aria-hidden />
            </summary>
            <p className={styles.faqA}>
              No. No throttles, no soft caps, no &quot;you&apos;ve used your X
              this month.&quot; The dashboard is the dashboard.
            </p>
          </details>

          <details className={styles.faqItem}>
            <summary className={styles.faqQ}>
              What about new modules?
              <span className={styles.faqChevron} aria-hidden />
            </summary>
            <p className={styles.faqA}>
              Included. Every new module (wearables, nutrition, finance, goals)
              ships into your existing subscription. Join now, lock in $15.
            </p>
          </details>
        </div>

        {/* Indie footer line */}
        <footer className={styles.indieFooter}>
          No VCs &nbsp;·&nbsp; No ads &nbsp;·&nbsp; No pivots &nbsp;·&nbsp;
          Just two brothers building what we needed
        </footer>
      </section>
    </main>
  )
}
