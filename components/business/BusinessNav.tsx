import Link from 'next/link'

const NAV_ITEMS = [
  { href: '/business', label: 'Overview', icon: '📊' },
  { href: '/business/lots', label: 'Lots', icon: '📦' },
  { href: '/business/orders', label: 'Orders', icon: '📋' },
  { href: '/business/stock', label: 'Stock', icon: '📈' },
  { href: '/business/sales', label: 'Sales', icon: '💰' },
  { href: '/business/collections', label: 'Collections', icon: '🏦' },
  { href: '/business/catalogue', label: 'Catalogue', icon: '🖼️' },
  { href: '/business/parties', label: 'Parties', icon: '👥' },
  { href: '/business/reports', label: 'Reports', icon: '📊' },
  { href: '/business/imperium', label: 'Imperium', icon: '🤖' },
]

export default function BusinessNav() {
  return (
    <nav className="business-nav">
      {NAV_ITEMS.map(item => (
        <Link key={item.href} href={item.href} className="business-nav-item">
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
