import ConnectGuide from '@/components/ConnectGuide'

export const dynamic = 'force-static'
export const metadata = { title: 'Vitals · connect guide' }

/** No-auth preview: the full guide with the band picker, Connect stubbed. */
export default function Page() {
  return <ConnectGuide />
}
