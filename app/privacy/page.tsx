import styles from './privacy.module.css'

/**
 * Privacy - the public, honest privacy policy. No auth, no tracking pitch,
 * no legalese wall: plain English, in the same calm editorial voice as the
 * rest of the funnel (serif ledes, mono labels, Inter body).
 *
 * Load-bearing facts (keep these true or update this page in the same
 * commit as the change):
 *   - data lives in Supabase, every table behind per-user row-level security
 *   - the app is served by Vercel
 *   - AI features send that request's content to Anthropic's Claude API,
 *     per request; the API terms bar training on it
 *   - Sentry receives production error reports (error + technical context)
 *   - Stripe handles payment details if the member subscribes
 *   - health data is the member's: renders their dashboard, computes their
 *     insights, and nothing else. Never sold, never used to train AI models.
 *   - the Claude connector reads/writes only the connecting user's rows via
 *     their own OAuth authorization; conversation data is never collected
 *   - connector writes keep a short per-user audit line (mcp_write_log),
 *     visible only to that user, removed with the account
 */

export const metadata = {
  title: 'Privacy · Vitality',
  description:
    'What Vitality collects, where it lives, and the promises we make about your health data. Plain English, no legalese.',
}

const EFFECTIVE = '2026-07-10'
const CONTACT = 'founder@example.com'

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8.5 6.5 12 13 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
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

const COLLECTED: Array<{ tag: string; text: string }> = [
  {
    tag: 'Account',
    text: 'Your email address and a hashed password (or your OAuth identity if you sign in that way). Used to sign you in and to reach you about your account.',
  },
  {
    tag: 'Training',
    text: 'The workouts you log: exercises, sets, reps, weights, and session notes.',
  },
  {
    tag: 'Nutrition',
    text: 'Meals, macros, water intake, and supplements you record in Fuel.',
  },
  {
    tag: 'Body',
    text: 'Weigh-ins and, if you add them, progress photos.',
  },
  {
    tag: 'Wearables',
    text: 'Sleep, recovery, and activity metrics from a wearable you choose to connect (WHOOP, Fitbit, or Oura), or values you import manually.',
  },
  {
    tag: 'Mind',
    text: 'Notes, quick jots, mood check-ins, and goals you write down.',
  },
  {
    tag: 'Finance',
    text: 'Net-worth entries, subscriptions, orders, and wishlist items you enter in the Finance module.',
  },
  {
    tag: 'Custom tiles',
    text: 'The data your own custom dashboard tiles store and report.',
  },
]

export default function PrivacyPage() {
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
            <span className={styles.lbl}>Privacy Policy</span>
            <span className={styles.rule} />
          </div>
          <h1 className={styles.title}>
            Your data is <em>yours</em>. Here is exactly how we treat it.
          </h1>
          <p className={styles.lede}>
            Vitality is a personal dashboard. You log your life into it, and
            the whole product is rendering that life back to you. That only
            works if you can trust where the data goes, so this page says it
            plainly: <b>what we collect, where it lives, and what we will
            never do with it.</b>
          </p>
          <span className={styles.effective}>
            Effective <b>{EFFECTIVE}</b>
          </span>
        </header>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.num}>i.</span>
            <span className={styles.lbl}>What we collect</span>
            <span className={styles.rule} />
          </div>
          <p className={styles.body}>
            Two kinds of data, and nothing hidden behind either: your account
            email, and the life data you deliberately log. We do not buy data
            about you, scrape your other accounts, or run advertising
            trackers.
          </p>
          <div className={styles.rows}>
            {COLLECTED.map((r) => (
              <div className={styles.row} key={r.tag}>
                <span className={styles.rowTag}>{r.tag}</span>
                <span className={styles.rowText}>{r.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.num}>ii.</span>
            <span className={styles.lbl}>Where it lives</span>
            <span className={styles.rule} />
          </div>
          <p className={styles.body}>
            Everything you log is stored in <b>Supabase</b> (a hosted Postgres
            database), and the app itself is served by <b>Vercel</b>. Every
            row in the database is tied to your user id and protected by
            per-user <b>row-level security</b>: the database itself refuses to
            return your rows to anyone who is not you. There is no shared
            pool, no cross-user analytics table built from your entries.
          </p>
          <p className={styles.body}>
            Supabase and Vercel are our infrastructure processors. They store
            and serve the bytes; they do not get to use your data for their
            own purposes.
          </p>
          <p className={styles.body}>
            Three more services touch data, each for one narrow job.{' '}
            <b>Anthropic</b> powers the AI features: when you use one (the
            food coach, the mentor chat, an insight), the specific content of
            that request goes to Anthropic&apos;s Claude API to produce the
            answer, and under the API terms it is not used to train models.
            Nothing is sent until you use an AI feature. <b>Sentry</b>{' '}
            receives error reports when something in the app breaks so we can
            fix it: the error and its technical context, not a feed of your
            logged entries. <b>Stripe</b> handles payment if you subscribe;
            your card details go to Stripe, never to us.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.num}>iii.</span>
            <span className={styles.lbl}>Your health data</span>
            <span className={styles.rule} />
          </div>
          <p className={styles.body}>
            Vitality members log <b>personal health and fitness data</b>:
            workouts, body weight, nutrition, hydration, supplements, mood,
            and wearable metrics like sleep and recovery. This deserves the
            strongest promises on the page:
          </p>
          <div className={styles.promise}>
            <div className={styles.promiseLine}>
              <CheckIcon />
              <span>
                <b>It is yours.</b> Your health data is used for exactly two
                things: rendering your dashboard and computing your insights.
                Nothing else.
              </span>
            </div>
            <div className={styles.promiseLine}>
              <CheckIcon />
              <span>
                <b>Never sold.</b> Not to advertisers, not to brokers, not to
                anyone, not in aggregate.
              </span>
            </div>
            <div className={styles.promiseLine}>
              <CheckIcon />
              <span>
                <b>Never used to train AI models.</b> Yours or anyone
                else&apos;s. That includes what you send to the AI features:
                the Claude API does not train on it.
              </span>
            </div>
            <div className={styles.promiseLine}>
              <CheckIcon />
              <span>
                <b>Never shared with third parties</b>, except the processors
                named above, each doing its one narrow job: Supabase and
                Vercel store and serve it, and Anthropic processes only the
                content you send when you use an AI feature.
              </span>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.num}>iv.</span>
            <span className={styles.lbl}>Retention</span>
            <span className={styles.rule} />
          </div>
          <p className={styles.body}>
            We keep your data <b>until you delete it or your account</b>.
            Delete an entry and it is gone from your dashboard; delete your
            account and your rows go with it. We do not keep shadow copies of
            deleted data for our own use. One honest footnote: actions taken
            through the Claude connection keep a short audit line (which tool
            ran, and a one-line summary of what it did) so you can see what
            Claude changed. It is visible only to you and is removed with
            your account. If you want your account removed and cannot do it
            from the app, email us and we will do it.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={`${styles.num} ${styles.numIris}`}>v.</span>
            <span className={styles.lbl}>The Claude connection</span>
            <span className={styles.rule} />
          </div>
          <div className={styles.claude}>
            <p className={styles.body}>
              You can connect Vitality to Claude as a{' '}
              <a href="/connect">custom connector</a>. When you do, the
              connection is authorized by <b>you, for you</b>: every tool
              reads and writes <b>only your rows</b>, through your own
              authorization, under the same row-level security as the app.
              Connecting does not open your data to other users, and it does
              not open other users&apos; data to you. <b>Your conversation
              with Claude is never collected</b> by Vitality: tools receive
              only the specific request they need to answer, and you can
              disconnect at any time from your Claude settings.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <span className={styles.num}>vi.</span>
            <span className={styles.lbl}>Contact</span>
            <span className={styles.rule} />
          </div>
          <p className={styles.body}>
            Vitality is built by two people, so privacy questions get read by
            a human who can actually change things. Write to us:
          </p>
          <a className={styles.contact} href={`mailto:${CONTACT}`}>
            <MailIcon />
            {CONTACT}
          </a>
        </section>

        <footer className={styles.foot}>
          <span>
            <span className={styles.footDot} />
            Vitality Studio
          </span>
          <span>
            Effective {EFFECTIVE} &nbsp;·&nbsp;{' '}
            <a href="/connect">Claude connector</a>
          </span>
        </footer>
      </div>
    </main>
  )
}
