import { CADENCE_UNIT_LABELS } from './types'
import type { Brand } from './types'
import { kpiDeltaSince } from './state'

/**
 * Compact brand snapshot sent to the AI routes (/api/brand/insight and
 * /api/brand/ask). The brand module stores state in localStorage, so the
 * server can't read it; the client ships this trimmed payload instead.
 *
 * Shared so the one-shot "read" and the conversational "ask" reason over the
 * exact same view of the brand.
 */
export function buildInsightPayload(brand: Brand) {
  return {
    name: brand.name,
    archetype: brand.archetype,
    blurb: brand.blurb,
    kpis: brand.kpis.map(k => ({
      label: k.label,
      value: k.value,
      unit: k.unit,
      ...(typeof k.target === 'number' ? { target: k.target } : {}),
      delta7: kpiDeltaSince(k, 7),
    })),
    links: brand.links.map(l => ({ label: l.label, url: l.url })),
    schedules: brand.schedules.map(s => ({
      label: s.label,
      target: s.target,
      unit: CADENCE_UNIT_LABELS[s.unit],
      period: s.period,
    })),
  }
}
