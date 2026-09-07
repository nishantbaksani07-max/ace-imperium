import BrandDetail from './BrandDetail'

interface Props {
  params: { id: string }
}

/**
 * Server entry for a single brand. The id is passed straight to the
 * client component, which then looks up the brand in localStorage.
 */
export default function BrandDetailPage({ params }: Props) {
  return <BrandDetail id={params.id} />
}
