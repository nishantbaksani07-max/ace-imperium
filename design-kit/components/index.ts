// Barrel export — one import path for every component.
//   import { Button, Card, Ring } from './design-kit/components'
// Remember to also import the styles once at your app root:
//   import './design-kit/tokens/tokens.css'
//   import './design-kit/components/styles.css'

export { default as Button } from './Button'
export type { ButtonProps, ButtonVariant } from './Button'

export { default as Card } from './Card'
export type { CardProps } from './Card'

export { default as Input, Input as TextInput, Textarea } from './Input'
export type { InputProps, TextareaProps } from './Input'

export { default as Badge } from './Badge'
export type { BadgeProps, BadgeTone } from './Badge'

export { default as Ring } from './Ring'
export type { RingProps } from './Ring'

export { default as Ticker } from './Ticker'
export type { TickerProps, TickerItem } from './Ticker'

export { default as PageShell } from './PageShell'
export type { PageShellProps } from './PageShell'

export { default as PosterGrid } from './PosterGrid'
export type { PosterGridProps, PosterConfig, PosterArt, PosterSlot } from './PosterGrid'
