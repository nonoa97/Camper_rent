import { ConversationState, MemoryEvent, MemoryEventMetadata } from './state'
import { createMemoryEvent } from './recommendationMemory'
import {
  createReferencedRecommendationEvent,
  RecommendationReferenceResult,
} from './recommendationReference'

export interface BuildRecommendationInteractionEventsInput {
  recommendationReferenceResult?: RecommendationReferenceResult | null
  primaryInteractionResult?: RecommendationReferenceResult | null
  secondaryInteractionResult?: RecommendationReferenceResult | null
  recommendationInteraction?: ConversationState['recommendationInteraction'] | null
  referenceTarget?: ConversationState['referenceTarget'] | null
  recommendationReferenceKind?: ConversationState['recommendationReference'] extends infer T
    ? T extends { kind?: infer K }
      ? K | null
      : string | null
    : string | null
  timestamp?: string
  now?: Date
}

export interface BuildRecommendationInteractionEventsResult {
  events: MemoryEvent[]
}

function getResolvedRecommendationTarget(
  result: RecommendationReferenceResult | null | undefined,
): RecommendationReferenceResult['target'] | undefined {
  return result?.status === 'resolved' ? result.target : undefined
}

function buildInteractionEvents(
  interaction: ConversationState['recommendationInteraction'] | null | undefined,
  primaryResult: RecommendationReferenceResult | null | undefined,
  secondaryResult: RecommendationReferenceResult | null | undefined,
  timestamp?: string,
): MemoryEvent[] {
  if (!interaction) return []

  const primaryTarget = getResolvedRecommendationTarget(primaryResult)
  if (!primaryTarget?.optionId) return []

  const metadata: MemoryEventMetadata = {
    sourceText: interaction.sourceText,
    interactionType: interaction.type,
  }
  if (interaction.targetReference) metadata.referenceTarget = interaction.targetReference
  if (interaction.targetRecommendationReference?.kind) {
    metadata.referenceKind = interaction.targetRecommendationReference.kind
  }

  if (interaction.type === 'selected' || interaction.type === 'dismissed') {
    return [
      createMemoryEvent({
        eventType: interaction.type,
        optionId: primaryTarget.optionId,
        camperSlug: primaryTarget.camperSlug,
        metadata,
      }, timestamp),
    ]
  }

  const secondaryTarget = getResolvedRecommendationTarget(secondaryResult)
  if (!secondaryTarget?.optionId) return []

  const comparedMetadata: MemoryEventMetadata = {
    ...metadata,
    comparedOptionId: secondaryTarget.optionId,
    comparedCamperSlug: secondaryTarget.camperSlug ?? null,
  }
  if (interaction.secondaryTargetReference) {
    comparedMetadata.secondaryReferenceTarget = interaction.secondaryTargetReference
  }
  if (interaction.secondaryRecommendationReference?.kind) {
    comparedMetadata.secondaryReferenceKind = interaction.secondaryRecommendationReference.kind
  }

  return [
    createMemoryEvent({
      eventType: 'compared',
      optionId: primaryTarget.optionId,
      camperSlug: primaryTarget.camperSlug,
      metadata: comparedMetadata,
    }, timestamp),
  ]
}

export function buildRecommendationInteractionEvents(
  input: BuildRecommendationInteractionEventsInput,
): BuildRecommendationInteractionEventsResult {
  const timestamp = input.timestamp ?? input.now?.toISOString()
  const interactionEvents = buildInteractionEvents(
    input.recommendationInteraction,
    input.primaryInteractionResult,
    input.secondaryInteractionResult,
    timestamp,
  )

  if (interactionEvents.length > 0) {
    return { events: interactionEvents }
  }

  if (!input.recommendationInteraction && input.recommendationReferenceResult?.status === 'resolved') {
    const event = createReferencedRecommendationEvent(
      input.recommendationReferenceResult,
      {
        referenceTarget: input.referenceTarget ?? null,
        referenceKind: input.recommendationReferenceKind ?? null,
      },
      timestamp,
    )
    return { events: event ? [event] : [] }
  }

  return { events: [] }
}
