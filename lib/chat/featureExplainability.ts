import featureNameMapping from './taxonomy/canonical-feature-keys.json'
import { getCapabilityDefinition, type CapabilityWeight } from './capabilities'
import type { CapabilityEvaluationMatch, ScoreBreakdownItem } from './evaluation'
import type { ConversationState } from './state'

export type FeatureExplanationKind =
  | 'hard_requirement_met'
  | 'hard_requirement_missing'
  | 'soft_preference_matched'
  | 'soft_preference_not_matched'
  | 'capability_feature_matched'
  | 'capability_feature_missing'

export type FeatureExplanationSource = 'feature_preference' | 'capability' | 'camper_fact'

export interface FeatureExplanation {
  kind: FeatureExplanationKind
  featureKey: string
  displayName: string
  source: FeatureExplanationSource
  strength?: 'hard' | 'soft'
  sourceText?: string
  capabilityKey?: string
  capabilityDisplayName?: string
  points?: number
  camperSlug?: string
  camperName?: string
}

export interface CapabilityFeatureExplanation {
  key: 'capability_feature'
  status: 'matched' | 'missing'
  capabilityKey: string
  capabilityDisplayName: string
  featureKey: string
  displayName: string
  weight: CapabilityWeight
  camperSlug: string
  camperName: string
}

export interface CapabilityExplanation {
  capabilityKey: string
  capabilityDisplayName: string
  strength: 'hard' | 'soft'
  score: number
  threshold?: number
  passedThreshold?: boolean
  matchedWeight: number
  totalWeight: number
  matchedFeatures: CapabilityFeatureExplanation[]
  missingFeatures: CapabilityFeatureExplanation[]
  explanationType: 'hard_pass' | 'hard_fail' | 'soft_bonus'
  camperSlug: string
  camperName: string
}

export interface RecommendationExplainability {
  camperSlug: string
  camperName: string
  featureExplanations: FeatureExplanation[]
  capabilityExplanations: CapabilityExplanation[]
  capabilityFeatureExplanations: CapabilityFeatureExplanation[]
  scoreExplanations: Array<{
    key: string
    label: string
    points: number
    relatedFeatureKeys?: string[]
    relatedCapabilityKeys?: string[]
  }>
}

export interface FeatureNoResultExplanation {
  featureRequirementFailCount: number
  missingHardFeatures: Array<{
    featureKey: string
    displayName: string
    sourceText?: string
    affectedCamperCount: number
  }>
  mostRestrictiveFeatures: Array<{
    featureKey: string
    displayName: string
    sourceText?: string
    affectedCamperCount: number
  }>
}

export interface CapabilityNoResultExplanation {
  capabilityRequirementFailCount: number
  failedCapabilities: Array<{
    capabilityKey: string
    displayName: string
    threshold: number
    affectedCamperCount: number
    averageScore: number
    mostCommonMissingFeatures: Array<{
      featureKey: string
      displayName: string
      affectedCamperCount: number
    }>
  }>
  mostRestrictiveCapabilities: Array<{
    capabilityKey: string
    displayName: string
    threshold: number
    affectedCamperCount: number
    averageScore: number
  }>
}

export type FeatureDisplayNameMap = Record<string, string>

const FEATURE_DISPLAY_FALLBACKS = Object.entries(featureNameMapping).reduce<Record<string, string>>(
  (acc, [name, key]) => {
    acc[key] = name
    return acc
  },
  {},
)

const CAPABILITY_DISPLAY_NAMES: Record<string, string> = {
  bike_transport: 'Kerékpárszállítás',
  off_grid: 'Off-grid használat',
  pet_travel: 'Kisállatos utazás',
  remote_work: 'Távoli munka',
  wild_camping: 'Vadkemping',
  winter_use: 'Téli használat',
}

export function resolveFeatureDisplayName(
  featureKey: string,
  displayNames: FeatureDisplayNameMap = {},
): string {
  return displayNames[featureKey] ?? FEATURE_DISPLAY_FALLBACKS[featureKey] ?? featureKey
}

export function resolveCapabilityDisplayName(capabilityKey: string): string {
  return CAPABILITY_DISPLAY_NAMES[capabilityKey] ?? capabilityKey
}

export function createFeatureExplanations(input: {
  state: ConversationState
  camperFeatureKeys: Set<string>
  camperSlug: string
  camperName: string
  featureDisplayNames?: FeatureDisplayNameMap
}): FeatureExplanation[] {
  const {
    state,
    camperFeatureKeys,
    camperSlug,
    camperName,
    featureDisplayNames = {},
  } = input

  return (state.featurePreferences ?? []).map(preference => {
    const hasFeature = camperFeatureKeys.has(preference.key)
    const isHard = preference.strength === 'hard'
    const kind: FeatureExplanationKind = isHard
      ? (hasFeature ? 'hard_requirement_met' : 'hard_requirement_missing')
      : (hasFeature ? 'soft_preference_matched' : 'soft_preference_not_matched')

    return {
      kind,
      featureKey: preference.key,
      displayName: resolveFeatureDisplayName(preference.key, featureDisplayNames),
      source: 'feature_preference',
      strength: preference.strength,
      sourceText: preference.sourceText,
      points: kind === 'soft_preference_matched' ? 6 : undefined,
      camperSlug,
      camperName,
    }
  })
}

export function createCapabilityFeatureExplanations(input: {
  capabilityMatches: CapabilityEvaluationMatch[]
  camperSlug: string
  camperName: string
  featureDisplayNames?: FeatureDisplayNameMap
}): CapabilityFeatureExplanation[] {
  const {
    capabilityMatches,
    camperSlug,
    camperName,
    featureDisplayNames = {},
  } = input

  return capabilityMatches.flatMap(match => {
    const definition = getCapabilityDefinition(match.capabilityKey)
    if (!definition) return []
    const matched = new Set(match.matchedFeatures)
    const capabilityDisplayName = resolveCapabilityDisplayName(match.capabilityKey)

    return definition.features.map(feature => ({
      key: 'capability_feature' as const,
      status: matched.has(feature.featureKey) ? 'matched' as const : 'missing' as const,
      capabilityKey: match.capabilityKey,
      capabilityDisplayName,
      featureKey: feature.featureKey,
      displayName: resolveFeatureDisplayName(feature.featureKey, featureDisplayNames),
      weight: feature.weight,
      camperSlug,
      camperName,
    }))
  })
}

export function createCapabilityExplanations(input: {
  capabilityMatches: CapabilityEvaluationMatch[]
  capabilityFeatureExplanations: CapabilityFeatureExplanation[]
  camperSlug: string
  camperName: string
  threshold: number
}): CapabilityExplanation[] {
  const {
    capabilityMatches,
    capabilityFeatureExplanations,
    camperSlug,
    camperName,
    threshold,
  } = input

  return capabilityMatches.map(match => {
    const relatedFeatures = capabilityFeatureExplanations
      .filter(explanation => explanation.capabilityKey === match.capabilityKey)
    const matchedFeatures = relatedFeatures.filter(explanation => explanation.status === 'matched')
    const missingFeatures = relatedFeatures.filter(explanation => explanation.status === 'missing')
    const isHard = match.strength === 'hard'
    const passedThreshold = isHard ? match.score >= threshold : undefined

    return {
      capabilityKey: match.capabilityKey,
      capabilityDisplayName: resolveCapabilityDisplayName(match.capabilityKey),
      strength: match.strength,
      score: match.score,
      threshold: isHard ? threshold : undefined,
      passedThreshold,
      matchedWeight: match.matchedWeight,
      totalWeight: match.totalWeight,
      matchedFeatures,
      missingFeatures,
      explanationType: isHard
        ? (passedThreshold ? 'hard_pass' : 'hard_fail')
        : 'soft_bonus',
      camperSlug,
      camperName,
    }
  })
}

export function createScoreExplanations(input: {
  scoreBreakdown: ScoreBreakdownItem[]
  featureExplanations: FeatureExplanation[]
  capabilityExplanations: CapabilityExplanation[]
}): RecommendationExplainability['scoreExplanations'] {
  const matchedSoftFeatureKeys = input.featureExplanations
    .filter(explanation => explanation.kind === 'soft_preference_matched')
    .map(explanation => explanation.featureKey)
  const matchedCapabilityKeys = [...new Set(
    input.capabilityExplanations
      .map(explanation => explanation.capabilityKey),
  )]

  return input.scoreBreakdown.map(item => ({
    key: item.key,
    label: item.label,
    points: item.points,
    relatedFeatureKeys: item.key === 'feature_match' ? matchedSoftFeatureKeys : undefined,
    relatedCapabilityKeys: item.key === 'capability_match'
      ? (item.capabilityKey ? [item.capabilityKey] : matchedCapabilityKeys)
      : undefined,
  }))
}

export function createRecommendationExplainability(input: {
  camperSlug: string
  camperName: string
  featureExplanations: FeatureExplanation[]
  capabilityExplanations: CapabilityExplanation[]
  capabilityFeatureExplanations: CapabilityFeatureExplanation[]
  scoreBreakdown: ScoreBreakdownItem[]
}): RecommendationExplainability {
  return {
    camperSlug: input.camperSlug,
    camperName: input.camperName,
    featureExplanations: input.featureExplanations,
    capabilityExplanations: input.capabilityExplanations,
    capabilityFeatureExplanations: input.capabilityFeatureExplanations,
    scoreExplanations: createScoreExplanations({
      scoreBreakdown: input.scoreBreakdown,
      featureExplanations: input.featureExplanations,
      capabilityExplanations: input.capabilityExplanations,
    }),
  }
}
