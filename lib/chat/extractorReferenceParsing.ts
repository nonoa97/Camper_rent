import type {
  RecommendationInteractionSignal,
  RecommendationReferenceHint,
  ReferenceTarget,
} from './state'
import { isKnownFeatureKey } from './preferences'
import { isKnownCapabilityKey } from './capabilities'

type RecommendationOptionReference = Extract<
  ReferenceTarget,
  'lastRecommendation' | 'firstShownOption' | 'lastShownOption'
>

export function isRecommendationOptionReference(value: unknown): value is RecommendationOptionReference {
  return value === 'lastRecommendation' || value === 'firstShownOption' || value === 'lastShownOption'
}

export function parseRecommendationReferenceHint(ref: unknown): RecommendationReferenceHint | undefined {
  if (!ref || typeof ref !== 'object') return undefined
  const value = ref as Record<string, unknown>

  if (value.kind === 'feature' && isKnownFeatureKey(value.featureKey)) {
    return { kind: 'feature', featureKey: value.featureKey }
  }

  if (
    value.kind === 'attribute' &&
    ['gearbox', 'beds', 'type', 'year'].includes(String(value.attributeKey))
  ) {
    return {
      kind: 'attribute',
      attributeKey: value.attributeKey as Extract<RecommendationReferenceHint, { kind: 'attribute' }>['attributeKey'],
      value: ['string', 'number', 'boolean'].includes(typeof value.value) ? value.value as string | number | boolean : undefined,
      relation: value.relation === 'eq' || value.relation === 'max' || value.relation === 'min' ? value.relation : undefined,
    }
  }

  if (value.kind === 'capability' && isKnownCapabilityKey(value.capabilityKey)) {
    return {
      kind: 'capability',
      capabilityKey: value.capabilityKey,
      minScore: typeof value.minScore === 'number' ? value.minScore : undefined,
    }
  }

  if (value.kind === 'price' && (value.relation === 'cheapest' || value.relation === 'most_expensive')) {
    return {
      kind: 'price',
      relation: value.relation,
      priceField: value.priceField === 'totalPrice' ? 'totalPrice' : 'pricePerDay',
    }
  }

  return undefined
}

export function parseRecommendationInteractionSignal(interaction: unknown): RecommendationInteractionSignal | undefined {
  if (!interaction || typeof interaction !== 'object') return undefined
  const value = interaction as Record<string, unknown>

  if (
    value.type !== 'selected' &&
    value.type !== 'dismissed' &&
    value.type !== 'compared'
  ) {
    return undefined
  }

  if (typeof value.sourceText !== 'string' || value.sourceText.trim().length === 0) {
    return undefined
  }

  const targetReference = isRecommendationOptionReference(value.targetReference)
    ? value.targetReference
    : undefined
  const targetRecommendationReference = parseRecommendationReferenceHint(value.targetRecommendationReference)
  const secondaryTargetReference = isRecommendationOptionReference(value.secondaryTargetReference)
    ? value.secondaryTargetReference
    : undefined
  const secondaryRecommendationReference = parseRecommendationReferenceHint(value.secondaryRecommendationReference)
  const hasPrimaryTarget = Boolean(targetReference || targetRecommendationReference)
  const hasSecondaryTarget = Boolean(secondaryTargetReference || secondaryRecommendationReference)

  if (!hasPrimaryTarget || (value.type === 'compared' && !hasSecondaryTarget)) {
    return undefined
  }

  return {
    type: value.type,
    targetReference,
    targetRecommendationReference,
    secondaryTargetReference,
    secondaryRecommendationReference,
    sourceText: value.sourceText.trim(),
  }
}
