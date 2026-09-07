'use client'

import styles from './mentor.module.css'
import type { VentTeaser } from './ventTeaser'

// Bold the one emphasis phrase inside Vee's reply (if present), so any dynamic
// number reads like the styled example without hand-bolding each variant.
function renderVee(text: string, emphasis?: string) {
  if (!emphasis || !text.includes(emphasis)) return text
  const i = text.indexOf(emphasis)
  return (
    <>
      {text.slice(0, i)}
      <strong className={styles.mdBold}>{emphasis}</strong>
      {text.slice(i + emphasis.length)}
    </>
  )
}

// The "Vent" hero. Preferred path: open Claude with full Vitality context over
// the MCP (zero API cost to us). In-app chat is the fallback (onVentHere focuses
// the chat box just below). The connect UI lives at /account. The teaser bubble
// is built from the user's REAL recent data (or an honest sample for new users)
// — never a hardcoded claim that "Vee read your data" when it didn't.
export default function VentDoorway({ teaser, onVentHere }: { teaser: VentTeaser; onVentHere: () => void }) {
  return (
    <section className={styles.contextSec} aria-label="vent with Vee">
      <div className={styles.secHead}>
        <span className={styles.secEyebrow}>vent</span>
        <span className={styles.secTitle}>Talk it out</span>
        <span className={styles.secRule} aria-hidden />
      </div>

      <div className={styles.door}>
        <div className={styles.doorHead}>Vent with Vee in Claude</div>
        <p className={styles.doorBody}>
          Open a private conversation in Claude that already sees your sleep, food, training, and spending. It listens first, then says the one true thing that helps.
        </p>

        <div className={styles.doorThread}>
          <div className={styles.bubUser}>{teaser.user}</div>
          <div className={styles.bubVee}>{renderVee(teaser.vee, teaser.emphasis)}</div>
          <div className={styles.doorTag}>
            {teaser.real
              ? 'Real. Vee read your actual data.'
              : 'A sample. This becomes yours once Vee has a few days of your data.'}
          </div>
        </div>

        <div className={styles.doorActions}>
          <a className={styles.doorBtnPrimary} href="/account">
            <svg viewBox="0 0 24 24" fill="none" stroke="#160d2e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            Set up Vee in Claude
          </a>
          <button className={styles.doorBtnGhost} type="button" onClick={onVentHere}>Or vent right here</button>
        </div>

        <div className={styles.trust}>
          <span className={styles.trustItem}><svg viewBox="0 0 24 24"><path d="M12 3l7 4v5c0 4-3 7-7 8-4-1-7-4-7-8V7z" /></svg> Private</span>
          <span className={styles.trustItem}><svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14" /></svg> Free in Claude</span>
          <span className={styles.trustItem}><svg viewBox="0 0 24 24"><path d="M4 12h4l3 7 4-14 3 7h2" /></svg> Speaks only when it helps</span>
        </div>
      </div>
    </section>
  )
}
