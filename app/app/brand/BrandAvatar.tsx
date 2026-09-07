import styles from './brand.module.css'
import { PLATFORM_LABELS, PLATFORM_SHORT } from './types'
import type { Platform } from './types'
import PlatformIcon, { PLATFORM_HAS_LOGO } from './PlatformIcon'

interface Props {
  platform: Platform
  /** Profile picture URL from /api/brand/refresh. */
  avatarUrl?: string
  /** Circle diameter in px. */
  size?: number
  /** Show the small platform chip in the corner. */
  badge?: boolean
}

/**
 * Shared account avatar: the profile picture in a circle, with a small
 * platform chip in the corner. When there's no picture, the circle falls back
 * to that platform's monochrome logo (Instagram, TikTok, YouTube, X) — or a
 * short-code chip for platforms we don't draw — so an empty account still reads
 * as its social at a glance. The corner badge is hidden in that case (the logo
 * already says which platform it is).
 *
 * `referrerPolicy="no-referrer"` is load-bearing — YouTube/Google avatars
 * (yt3.ggpht.com) and TikTok CDNs 403 hotlinked requests that carry a
 * referer, so without this the <img> silently fails and you get a blank
 * circle even though the URL is valid. Plain <img> (not next/image) avoids
 * whitelisting the many sharded CDN domains in next.config.
 */
export default function BrandAvatar({ platform, avatarUrl, size = 44, badge = true }: Props) {
  return (
    <span className={styles.brandAvatar} style={{ width: size, height: size }}>
      <span className={styles.brandAvatarCircle}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className={styles.brandAvatarImg}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : PLATFORM_HAS_LOGO.has(platform) ? (
          <span className={styles.brandAvatarLogo} aria-hidden>
            <PlatformIcon platform={platform} size={Math.round(size * 0.52)} />
          </span>
        ) : (
          <span className={styles.brandAvatarFallback} aria-hidden>
            {PLATFORM_SHORT[platform]}
          </span>
        )}
      </span>
      {badge && avatarUrl && (
        <span className={styles.brandAvatarBadge} title={PLATFORM_LABELS[platform]} aria-hidden>
          {PLATFORM_SHORT[platform]}
        </span>
      )}
    </span>
  )
}
