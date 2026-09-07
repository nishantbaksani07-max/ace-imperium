import { type ReactNode } from 'react'

import styles from './connect.module.css'

/**
 * Connect - the public docs page for the Vitality Claude connector.
 * No auth. This is the "Documentation URL" we hand to the Anthropic
 * directory submission, and the page the privacy policy links to.
 *
 * Load-bearing facts (keep true or update in the same commit):
 *   - MCP endpoint: http://localhost:3000/api/mcp/mcp
 *   - the deep link opens Claude's Add custom connector dialog prefilled
 *   - manual path on individual plans: Customize, then Connectors,
 *     then Add custom connector
 *   - Claude's Free plan allows one custom connector
 */

export const metadata = {
  title: 'Connect Claude · Vitality',
  description:
    'Add the Vitality connector to Claude in one click. Setup, example prompts, and troubleshooting.',
}

const MCP_URL = 'http://localhost:3000/api/mcp/mcp'
const DEEP_LINK =
  'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Vitality&connectorUrl=https%3A%2F%2Flocalhost:3000%2Fapi%2Fmcp%2Fmcp'
const SUPPORT = 'founder@example.com'

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4 8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function QuoteIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 13.5v-3A6.5 6.5 0 0 1 9 4h.5M9 13.5v-3A6.5 6.5 0 0 1 15.5 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="1.5"
        y="3"
        width="13"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="m2.5 4.5 5.5 4.5 5.5-4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const STEPS: Array<{ n: string; text: ReactNode }> = [
  {
    n: '1',
    text: (
      <>
        In Claude, open <b>Customize</b>, then <b>Connectors</b>.
      </>
    ),
  },
  {
    n: '2',
    text: (
      <>
        Choose <b>Add custom connector</b>.
      </>
    ),
  },
  {
    n: '3',
    text: (
      <>
        Paste this URL as the server URL: <code>{MCP_URL}</code>
      </>
    ),
  },
  {
    n: '4',
    text: (
      <>
        Hit <b>Add</b>, then <b>Connect</b>. Log into Vitality when asked and
        press <b>Allow</b>.
      </>
    ),
  },
]

const PROMPTS: Array<{ tag: string; text: string }> = [
  {
    tag: 'Build',
    text: 'Build me a tile that tracks my morning reading streak.',
  },
  {
    tag: 'Notice',
    text: 'What is quietly working against my goal?',
  },
  {
    tag: 'Log',
    text: 'Log my workout: bench 5x5 at 80 kg, then incline curls 3x10.',
  },
]

const TROUBLE: Array<{ tag: string; text: ReactNode }> = [
  {
    tag: 'Read-only',
    text: (
      <>
        If Claude treats the connection as read-only or tools are missing,
        remove the connector and reconnect it. A fresh connection picks up
        the full tool set.
      </>
    ),
  },
  {
    tag: 'Free plan',
    text: (
      <>
        Claude&apos;s Free plan allows <b>one</b> custom connector. If your
        slot is taken, remove the other connector or upgrade your Claude
        plan.
      </>
    ),
  },
  {
    tag: 'Auth failed',
    text: (
      <>
        Log into Vitality first at{' '}
        <a href="http://localhost:3000">localhost:3000</a>
        , then press <b>Connect</b> again in Claude. The authorization needs a
        signed-in Vitality session.
      </>
    ),
  },
]

export default function ConnectPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.chrome}>
          <a className={styles.wordmark} href="/">
            Vitality
          </a>
          <a className={styles.chromeLink} href="/">
            Back to Vitality
          </a>
        </nav>

        <header className={styles.head}>
          <div className={styles.eyebrow}>
            <span className={styles.lbl}>Claude Connector</span>
            <span className={styles.rule} />
          </div>
          <h1 className={styles.title}>
            Your dashboard, <em>inside</em> Claude.
          </h1>
          <p className={styles.lede}>
            The Vitality connector links Claude to your Vitality dashboard.
            Once connected, Claude can read the life you log there (training,
            nutrition, water, weight, wearables, goals, notes) and write back
            to it, including <b>building whole new tiles</b> onto your
            dashboard. Everything runs through your own authorization: the
            connector sees only your rows, and your conversations with Claude
            are never collected. The details live in the{' '}
            <a href="/privacy">privacy policy</a>.
          </p>
        </header>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={`${styles.num} ${styles.numIris}`}>i.</span>
            <span className={styles.lbl}>One-click setup</span>
            <span className={styles.rule} />
          </div>
          <p className={styles.body}>
            The fast way. This opens Claude with the connector already filled
            in; you review the values, add it, then log into Vitality and
            allow the connection.
          </p>
          <a className={styles.cta} href={DEEP_LINK}>
            <SparkIcon />
            Add Vitality to Claude
          </a>
          <span className={styles.ctaNote}>
            Opens claude.ai with the connector prefilled. Signed out? Claude
            asks you to sign in first, then lands you on the same dialog.
          </span>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.num}>ii.</span>
            <span className={styles.lbl}>Manual setup</span>
            <span className={styles.rule} />
          </div>
          <p className={styles.body}>
            The same result, by hand, if you prefer to type it yourself:
          </p>
          <div className={styles.steps}>
            {STEPS.map((s) => (
              <div className={styles.step} key={s.n}>
                <span className={styles.stepNum}>{s.n}</span>
                <span className={styles.stepText}>{s.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.num}>iii.</span>
            <span className={styles.lbl}>Try these first</span>
            <span className={styles.rule} />
          </div>
          <p className={styles.body}>
            Three prompts that show what the connection is for:
          </p>
          <div className={styles.prompts}>
            {PROMPTS.map((p) => (
              <div className={styles.prompt} key={p.tag}>
                <span className={styles.promptTag}>
                  <QuoteIcon />
                  {p.tag}
                </span>
                <span className={styles.promptText}>{p.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.num}>iv.</span>
            <span className={styles.lbl}>Troubleshooting</span>
            <span className={styles.rule} />
          </div>
          <div className={styles.rows}>
            {TROUBLE.map((t) => (
              <div className={styles.row} key={t.tag}>
                <span className={styles.rowTag}>{t.tag}</span>
                <span className={styles.rowText}>{t.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.num}>v.</span>
            <span className={styles.lbl}>Support</span>
            <span className={styles.rule} />
          </div>
          <p className={styles.body}>
            Something else in the way? Email us. Vitality is built by two
            people, so your message is read by a human who can actually fix
            it.
          </p>
          <a className={styles.contact} href={`mailto:${SUPPORT}`}>
            <MailIcon />
            {SUPPORT}
          </a>
        </section>

        <footer className={styles.foot}>
          <span>
            <span className={styles.footDot} />
            Vitality Studio
          </span>
          <span>
            <a href="/privacy">Privacy policy</a>
          </span>
        </footer>
      </div>
    </main>
  )
}
