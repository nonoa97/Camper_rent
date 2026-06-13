import type { ConversationState, FlowState } from './state'
import type { NextQuestion } from './nextQuestion'
import { hasWildCampingCapability } from './nextQuestion'
import type { GptContext } from './prompts'
import { hasPreferenceContext } from './preferenceContext'

function hasFlexibleTimingContext(state: ConversationState): boolean {
  return !!(
    state.flexibleCriteria?.months?.length ||
    state.flexibleCriteria?.preferredStartWindows?.length
  )
}

export function normalizeFlowFromIntent(intent: ConversationState['intent']): FlowState['activeFlow'] {
  if (intent === 'faq' || intent === 'booking' || intent === 'catalog' || intent === 'availability' || intent === 'recommendation') {
    return intent
  }
  return 'recommendation'
}

export function resolveMode(
  state: ConversationState,
  nextQuestion: string | null,
  refinementSignal?: string | boolean | null,
): GptContext['mode'] {
  if (nextQuestion && state.intent !== 'faq' && state.intent !== 'booking' && state.intent !== 'catalog') {
    return 'ask_next_question'
  }
  // Refinement after availability/any mode is a recommendation concept.
  if (refinementSignal && !nextQuestion) {
    return 'recommend'
  }
  switch (state.intent) {
    case 'faq':             return 'faq'
    case 'booking':         return 'booking'
    case 'catalog':         return 'catalog'
    case 'availability':    return 'availability'
    case 'recommendation':  return 'recommend'
    default: {
      // Only recommend when recommendation context exists; bare undefined intent defaults to catalog.
      const hasRecommendationContext = !!(
        state.month || state.startDate || state.durationDays || state.passengers ||
        state.campingType || hasWildCampingCapability(state) ||
        hasFlexibleTimingContext(state) ||
        hasPreferenceContext(state) ||
        state.earliestAvailable || state.alreadyRecommendedSlugs?.length
      )
      return hasRecommendationContext ? 'recommend' : 'catalog'
    }
  }
}

export function updateFlowForResponse(
  flowState: FlowState,
  state: ConversationState,
  effectiveMode: GptContext['mode'],
  nextQuestionData: NextQuestion | null,
  isFaqInterruption: boolean,
): FlowState {
  if (nextQuestionData) {
    return {
      ...flowState,
      activeFlow: normalizeFlowFromIntent(state.intent),
      activeStep: 'checklist',
      pendingQuestionField: nextQuestionData.field,
      pendingQuestionText: nextQuestionData.question,
      canResumePreviousFlow: false,
    }
  }

  if (isFaqInterruption) {
    return {
      ...flowState,
      activeFlow: flowState.activeFlow ?? normalizeFlowFromIntent(state.intent),
      activeStep: flowState.activeStep ?? 'checklist',
      lastSideTopic: 'faq',
      canResumePreviousFlow: true,
    }
  }

  const activeStep: FlowState['activeStep'] =
    effectiveMode === 'ask_next_question' ? 'checklist'
      : effectiveMode === 'recommend' ? 'recommendation'
        : effectiveMode === 'availability' ? 'availability_check'
          : effectiveMode === 'booking' ? 'booking'
            : effectiveMode === 'catalog' ? 'catalog'
              : effectiveMode === 'faq' ? 'faq'
                : undefined

  return {
    ...flowState,
    activeFlow: normalizeFlowFromIntent(state.intent),
    activeStep,
    pendingQuestionField: undefined,
    pendingQuestionText: undefined,
    canResumePreviousFlow: false,
  }
}
