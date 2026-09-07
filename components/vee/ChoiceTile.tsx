import SplitGlyph, { type SplitGlyphKind } from '@/components/SplitGlyph'
import styles from './veeTile.module.css'

export interface ChoiceOption { label: string; value: string; glyph: SplitGlyphKind }

export default function ChoiceTile({
  lead, sub, options, onPick,
}: {
  lead: React.ReactNode
  sub: string
  options: ChoiceOption[]
  onPick: (value: string) => void
}) {
  return (
    <>
      <div className={styles.lead}>{lead}</div>
      <p className={styles.sub}>{sub}</p>
      <div className={styles.choices}>
        {options.map(o => (
          <button key={o.value} type="button" className={`${styles.btn} ${styles.pick}`} onClick={() => onPick(o.value)}>
            <SplitGlyph kind={o.glyph} size={16} />{o.label}
          </button>
        ))}
      </div>
    </>
  )
}
