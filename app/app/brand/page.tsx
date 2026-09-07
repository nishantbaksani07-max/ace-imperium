import BrandModule from './BrandModule'

/**
 * Server entry. The module is fully client-driven for now (localStorage
 * at `vitality_brand_v1`); Supabase wiring lands in a later BUILD.
 * Auth + onboarded gating handled upstream in app/app/layout.tsx.
 */
export default function BrandPage() {
  return <BrandModule />
}
