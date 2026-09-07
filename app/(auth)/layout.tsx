import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="center-screen">
      <div className="container-narrow stack stack-6">
        <Link href="/" className="auth-mark" aria-label="Vitality home">
          <span className="brand-mark">V</span>
          <span className="brand-wordmark">Vitality</span>
        </Link>
        {children}
      </div>
    </main>
  )
}
