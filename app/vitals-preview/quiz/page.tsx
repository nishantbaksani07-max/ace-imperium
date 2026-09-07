import VitalsQuiz from './VitalsQuiz'

export const metadata = { title: 'Vitals · setup' }

export default function Page() {
  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <VitalsQuiz />
    </main>
  )
}
