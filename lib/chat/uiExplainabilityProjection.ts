import type { BackendSelectedRecommendation, NoResultReasonSummary } from './evaluationContext'
import type {
  ExplainabilityItem,
  ExplainabilityPresentationBundle,
  RecommendationExplanationSummary,
} from './explainabilityPresentation'

export interface UiRecommendationBadge {
  kind: 'score' | 'price' | 'discount' | 'availability' | 'branch'
  label: string
  value?: string | number
}

export interface UiPreferenceMatch {
  kind: 'feature' | 'attribute' | 'capability' | 'pricing'
  key: string
  label: string
  strength?: 'hard' | 'soft'
  points?: number
  score?: number
}

export interface UiCapabilitySummary {
  capabilityKey: string
  label: string
  score: number
  matchedWeight?: number
  totalWeight?: number
}

export interface UiRecommendationExplanation {
  slug: string
  name: string
  score: number | null
  badges: UiRecommendationBadge[]
  matchedPreferences: UiPreferenceMatch[]
  capabilitySummary: UiCapabilitySummary[]
  reasons: string[]
}

export interface UiNoResultExplanation {
  failCounts: {
    capacity: number
    availability: number
    duration: number
    wildCamping: number
    featureRequirement: number
    attributeRequirement: number
    pricingBudget: number
    capabilityRequirement: number
  }
  reasons: string[]
}

export interface UiExplainabilityProjection {
  schemaVersion: 1
  source: 'backend_explainability_projection'
  recommendationTruthSource: 'evaluation_engine'
  recommendations: UiRecommendationExplanation[]
  noResult?: UiNoResultExplanation
}

function formatCurrency(value: number | undefined): string | undefined {
  if (value == null) return undefined
  return `${value.toLocaleString('hu-HU').replace(/\u00a0/g, ' ')} Ft`
}

function evidenceString(evidence: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = evidence?.[key]
  return typeof value === 'string' ? value : undefined
}

function evidenceNumber(evidence: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = evidence?.[key]
  return typeof value === 'number' ? value : undefined
}

function recommendationSummaryFor(
  presentation: ExplainabilityPresentationBundle | undefined,
  slug: string,
): RecommendationExplanationSummary | undefined {
  return presentation?.recommendations.find(item => item.slug === slug)
}

function buildBadges(recommendation: BackendSelectedRecommendation): UiRecommendationBadge[] {
  const badges: UiRecommendationBadge[] = []
  if (recommendation.score != null) {
    badges.push({ kind: 'score', label: 'Pontszám', value: recommendation.score })
  }
  if (recommendation.pricing.pricePerDay != null) {
    badges.push({ kind: 'price', label: 'Napidíj', value: formatCurrency(recommendation.pricing.pricePerDay) })
  }
  if (recommendation.pricing.total != null) {
    badges.push({ kind: 'price', label: 'Összesen', value: formatCurrency(recommendation.pricing.total) })
  }
  if ((recommendation.pricing.discountPercent ?? 0) > 0) {
    badges.push({ kind: 'discount', label: 'Kedvezmény', value: `${recommendation.pricing.discountPercent}%` })
  }
  if (recommendation.availabilitySummary?.from) {
    badges.push({ kind: 'availability', label: 'Elérhető', value: recommendation.availabilitySummary.from })
  }
  if (recommendation.branchLabel) {
    badges.push({ kind: 'branch', label: 'Ág', value: recommendation.branchLabel })
  }
  return badges
}

function preferenceMatchFromItem(item: ExplainabilityItem): UiPreferenceMatch | undefined {
  if (item.kind === 'feature_match') {
    const key = evidenceString(item.evidence, 'featureKey')
    if (!key) return undefined
    return {
      kind: 'feature',
      key,
      label: item.message,
      strength: evidenceString(item.evidence, 'strength') as 'hard' | 'soft' | undefined,
      points: evidenceNumber(item.evidence, 'points'),
    }
  }
  if (item.kind === 'capability_match') {
    const key = evidenceString(item.evidence, 'capabilityKey')
    if (!key) return undefined
    return {
      kind: 'capability',
      key,
      label: item.message,
      strength: evidenceString(item.evidence, 'strength') as 'hard' | 'soft' | undefined,
      score: evidenceNumber(item.evidence, 'score'),
    }
  }
  if (item.kind === 'recommendation_reason' && evidenceString(item.evidence, 'key') === 'attribute_match') {
    const key = evidenceString(item.evidence, 'attributeKey') ?? 'attribute'
    return {
      kind: 'attribute',
      key,
      label: item.message,
      points: evidenceNumber(item.evidence, 'points'),
    }
  }
  if (item.kind === 'recommendation_reason' && evidenceString(item.evidence, 'key') === 'pricing_preference_match') {
    return {
      kind: 'pricing',
      key: 'pricing_preference_match',
      label: item.message,
      points: evidenceNumber(item.evidence, 'points'),
    }
  }
  return undefined
}

function capabilitySummaryFromItem(item: ExplainabilityItem): UiCapabilitySummary | undefined {
  if (item.kind !== 'capability_match' && item.kind !== 'capability_missing') return undefined
  const capabilityKey = evidenceString(item.evidence, 'capabilityKey')
  const score = evidenceNumber(item.evidence, 'score')
  if (!capabilityKey || score == null) return undefined
  return {
    capabilityKey,
    label: item.message,
    score,
    matchedWeight: evidenceNumber(item.evidence, 'matchedWeight'),
    totalWeight: evidenceNumber(item.evidence, 'totalWeight'),
  }
}

function buildRecommendationProjection(
  recommendation: BackendSelectedRecommendation,
  presentation: ExplainabilityPresentationBundle | undefined,
): UiRecommendationExplanation {
  const summary = recommendationSummaryFor(presentation, recommendation.slug)
  const items = summary?.items ?? []
  return {
    slug: recommendation.slug,
    name: recommendation.name,
    score: recommendation.score,
    badges: buildBadges(recommendation),
    matchedPreferences: items
      .map(preferenceMatchFromItem)
      .filter((match): match is UiPreferenceMatch => !!match),
    capabilitySummary: items
      .map(capabilitySummaryFromItem)
      .filter((match): match is UiCapabilitySummary => !!match),
    reasons: items
      .filter(item => item.audience.includes('ui'))
      .map(item => item.message),
  }
}

function buildNoResultProjection(
  summary: NoResultReasonSummary | undefined,
  presentation: ExplainabilityPresentationBundle | undefined,
): UiNoResultExplanation | undefined {
  if (!summary) return undefined
  return {
    failCounts: {
      capacity: summary.capacityFailCount,
      availability: summary.availabilityFailCount,
      duration: summary.durationFailCount,
      wildCamping: summary.wildCampingFailCount,
      featureRequirement: summary.featureRequirementFailCount,
      attributeRequirement: summary.attributeRequirementFailCount,
      pricingBudget: summary.pricingBudgetFailCount,
      capabilityRequirement: summary.capabilityRequirementFailCount,
    },
    reasons: (presentation?.noResult?.items ?? [])
      .filter(item => item.audience.includes('ui'))
      .map(item => item.message),
  }
}

export function buildUiExplainabilityProjection(input: {
  backendSelectedRecommendations?: BackendSelectedRecommendation[]
  noResultReasonSummary?: NoResultReasonSummary
  explainabilityPresentation?: ExplainabilityPresentationBundle
}): UiExplainabilityProjection {
  return {
    schemaVersion: 1,
    source: 'backend_explainability_projection',
    recommendationTruthSource: 'evaluation_engine',
    recommendations: (input.backendSelectedRecommendations ?? [])
      .map(recommendation => buildRecommendationProjection(recommendation, input.explainabilityPresentation)),
    noResult: buildNoResultProjection(input.noResultReasonSummary, input.explainabilityPresentation),
  }
}
