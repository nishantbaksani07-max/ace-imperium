import styles from './veeTile.module.css'

const Check = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L19 7" /></svg>
const Edit = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4l6 6L8 22H2v-6z" /></svg>

export default function ConfirmTile({
  lead, sub, confirmLabel, onConfirm, onReject,
}: {
  lead: React.ReactNode
  sub: string
  confirmLabel: string
  onConfirm: () => void
  onReject: () => void
}) {
  return (
    <>
      <div className={styles.lead}>{lead}</div>
      <p className={styles.sub}>{sub}</p>
      <div className={styles.choices}>
        <button type="button" className={`${styles.btn} ${styles.pri}`} onClick={onConfirm}>{Check}{confirmLabel}</button>
        <button type="button" className={`${styles.btn} ${styles.sec}`} onClick={onReject}>{Edit}Actually&hellip;</button>
      </div>
    </>
  )
}
