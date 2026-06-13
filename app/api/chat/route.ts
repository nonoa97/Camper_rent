import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import {
  AvailabilityCriteria,
  ConversationState,
  FlowState,
  MentionedCamperMemory,
  SessionMemory,
} from '@/lib/chat/state'
import { extractStateUpdate } from '@/lib/chat/extractState'
import { getNextMissingQuestion, hasWildCampingCapability, NextQuestion } from '@/lib/chat/nextQuestion'
import { searchAvailableCampers, findEarliestAvailableCamper, getSpecificCamperAvailability, CamperResult } from '@/lib/chat/availability'
import { CamperEvaluationResult, evaluateCampers } from '@/lib/chat/evaluation'
import {
  BackendSelectedRecommendation,
} from '@/lib/chat/evaluationContext'
import {
  appendMemoryEvents,
  RecommendationMemoryInput,
  rememberRecommendationSnapshots,
} from '@/lib/chat/recommendationMemory'
import { validateAndSanitizeSessionMemory } from '@/lib/chat/sessionMemoryValidation'
import {
  RecommendationReferenceResult,
} from '@/lib/chat/recommendationReference'
import { resolveRecommendationReferencesForTurn } from '@/lib/chat/recommendationReferenceOrchestrator'
import { explainRecommendationReferenceResult } from '@/lib/chat/recommendationReferenceExplainability'
import { buildRecommendationInteractionEvents } from '@/lib/chat/recommendationInteractionEvents'
import {
  applyRefinementIntentDelta,
} from '@/lib/chat/refinementPipeline'
import { loadFaqItems, FaqItem } from '@/lib/chat/faq'
import { loadExtras, ExtraItem } from '@/lib/chat/extras'
import { loadCatalogSummary, CatalogEntry } from '@/lib/chat/catalog'
import { validateGptOutput, FALLBACK_OUTPUT } from '@/lib/chat/validateOutput'
import { applyReplySafety } from '@/lib/chat/replySafety'
import { assembleGptContext } from '@/lib/chat/contextAssembler'
import {
  createAvailabilityCriteria,
  rememberSessionAvailability,
  rememberStaleAvailabilityResult,
  resolveSessionAvailabilityReference,
} from '@/lib/chat/availabilityMemory'
import {
  applyAvailabilitySlotConfirmation,
  applyEarliestPendingAvailability,
  applyLongestPendingAvailability,
  buildEarliestAvailabilityConfirmation,
  buildFallbackAvailabilityShiftConfirmation,
  buildLongestAvailableDurationReply,
  buildProgressiveAvailabilityReply,
  buildRememberedSlotDurationReply,
  createFlexibleSearchBranches,
  getFirstAvailableResult,
  getLongestAvailableSlot,
  getReferencedAvailabilitySlot,
  sessionAvailabilityToMemorySlot,
} from '@/lib/chat/availabilityOrchestration'
import { buildRefinementContext } from '@/lib/chat/refinementContext'
import { SYSTEM_PROMPT, buildContextBlock, EvaluationStatus, GptContext, SearchType } from '@/lib/chat/prompts'
import {
  applyStateLifecycleUpdate,
  dedupeBy,
  ensureConversationMemory,
  hasSpecificUserUpdate,
} from '@/lib/chat/stateLifecycle'
import {
  resolveMode,
  updateFlowForResponse,
} from '@/lib/chat/flowPipeline'
import {
  buildRecommendationProjection,
  runRecommendationEvaluation,
} from '@/lib/chat/recommendationPipeline'
import { hasPreferenceContext } from '@/lib/chat/preferenceContext'
import { createChatDebugLogger } from '@/lib/chat/chatDebugLogger'
import { positivePriceOrUndefined } from '@/lib/chat/priceUtils'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

type HistoryItem = { role: 'user' | 'assistant'; content: string }

type ApiRequest = {
  message: string
  conversationId?: string
  history?: HistoryItem[]
  state?: ConversationState
  flowState?: FlowState
  sessionMemory?: SessionMemory
}

type EnrichedRecommendation = {
  slug: string
  text: string
  name: string
  image_url: string
  price_per_day: number | null
  type: string | null
  beds: number | null
}

type AvailabilitySlot = {
  slug: string
  name: string
  image_url: string
  price_per_day: number | null
  type: string | null
  beds: number | null
  from: string
  to: string
  days: number
}

function countKnownFields(s: ConversationState): number {
  let n = 0
  if (s.month || s.startDate || s.earliestAvailable) n++
  if (s.durationDays) n++
  if (s.passengers) n++
  if (s.campingType || hasWildCampingCapability(s)) n++
  if (hasPreferenceContext(s)) n++
  return n
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

type BranchSearchSummary = {
  label: string
  criteria: AvailabilityCriteria
  resultCount: number
}

function recommendationMemoryInputFromBackend(
  recommendation: BackendSelectedRecommendation,
): RecommendationMemoryInput {
  return {
    camperSlug: recommendation.slug,
    camperName: recommendation.name,
    pricePerDay: positivePriceOrUndefined(recommendation.pricePerDay),
    totalPrice: recommendation.pricing.total,
    score: recommendation.score,
    source: 'evaluation_engine',
    featureKeys: recommendation.featureKeys,
    attributeFacts: recommendation.attributeFacts,
    capabilityMatches: recommendation.capabilityMatches,
    availabilitySummary: recommendation.availabilitySummary ?? recommendation.availableSlots[0],
  }
}

function recommendationMemoryInputFromCamper(camper: CamperResult): RecommendationMemoryInput {
  const slot = camper.availableSlots[0]
  return {
    camperSlug: camper.slug,
    camperName: camper.name,
    pricePerDay: positivePriceOrUndefined(camper.price_per_day),
    source: 'legacy_fallback',
    attributeFacts: {
      beds: camper.beds,
      type: camper.type,
    },
    availabilitySummary: slot
      ? {
          from: slot.from,
          to: slot.to,
          days: slot.days,
        }
      : undefined,
  }
}

function rememberSessionRecommendation(
  sessionMemory: SessionMemory,
  inputs: RecommendationMemoryInput[],
  state: ConversationState,
): SessionMemory {
  return rememberRecommendationSnapshots(sessionMemory, inputs, state)
}

function rememberMentionedCampers(
  state: ConversationState,
  campers: CamperResult[],
  reasons: Record<string, string> = {},
) {
  if (campers.length === 0) return
  // ConversationMemory keeps a short prompt-context mirror only.
  // Stable recommendation history and option events live in SessionMemory.
  const nextCampers: MentionedCamperMemory[] = campers.map(camper => ({
    slug: camper.slug,
    name: camper.name,
    pricePerDay: positivePriceOrUndefined(camper.price_per_day),
    type: camper.type,
    beds: camper.beds,
    reason: reasons[camper.slug],
  }))
  const memory = ensureConversationMemory(state)
  memory.mentionedCampers = dedupeBy(
    [...(memory.mentionedCampers ?? []), ...nextCampers],
    camper => camper.slug,
  ).slice(-8)
  const first = nextCampers[0]
  memory.lastAssistantOffer = {
    type: 'camper_recommendation',
    label: first.name ?? first.slug,
    camperSlug: first.slug,
  }
}

export async function POST(req: NextRequest) {
  let chatDebugLogger: ReturnType<typeof createChatDebugLogger> | undefined
  try {
    const body: ApiRequest = await req.json()
    const {
      message,
      conversationId,
      history = [],
      state: incomingState = {},
      flowState: incomingFlowState = {},
      sessionMemory: incomingSessionMemory = {},
    } = body
    chatDebugLogger = createChatDebugLogger({
      message,
      history,
      incomingState,
      incomingFlowState,
      incomingSessionMemory,
      conversationId,
    })
    let flowState: FlowState = { ...incomingFlowState }
    let sessionMemory: SessionMemory = validateAndSanitizeSessionMemory(incomingSessionMemory).memory

    if (!message || typeof message !== 'string') {
      await chatDebugLogger.finish('invalid_request', { reason: 'missing_message' })
      return NextResponse.json({ error: 'Hiányzó üzenet' }, { status: 400 })
    }

    // 1. Update conversation state from new message (GPT-4o-mini extraction, regex fallback)
    const stateUpdate = await extractStateUpdate(message, history, incomingState)
    chatDebugLogger.stage('state_extracted', { stateUpdate })
    const lifecycle = applyStateLifecycleUpdate({
      incomingState,
      stateUpdate,
      message,
      sessionMemory,
    })
    const state = lifecycle.state
    sessionMemory = lifecycle.sessionMemory
    const {
      answeredCurrentField,
      answeredNonTimingField,
      isFaqInterruption,
      confirmedPendingAvailability,
      changedAvailabilityFields,
    } = lifecycle
    chatDebugLogger.stage('state_lifecycle_applied', {
      state,
      flowState,
      sessionMemory,
      answeredCurrentField,
      answeredNonTimingField,
      isFaqInterruption,
      confirmedPendingAvailability,
      changedAvailabilityFields,
    })

    const {
      recommendationReferenceResult,
      primaryInteractionResult: interactionPrimaryResult,
      secondaryInteractionResult: interactionSecondaryResult,
    } = resolveRecommendationReferencesForTurn({ state, sessionMemory })
    chatDebugLogger.stage('recommendation_references_resolved', {
      recommendationReferenceResult,
      interactionPrimaryResult,
      interactionSecondaryResult,
    })
    const recommendationReferenceExplanation = recommendationReferenceResult
      ? explainRecommendationReferenceResult(recommendationReferenceResult)
      : undefined
    const { events: recommendationInteractionEvents } = buildRecommendationInteractionEvents({
      recommendationReferenceResult,
      primaryInteractionResult: interactionPrimaryResult,
      secondaryInteractionResult: interactionSecondaryResult,
      recommendationInteraction: state.recommendationInteraction,
      referenceTarget: state.referenceTarget,
      recommendationReferenceKind: state.recommendationReference?.kind ?? null,
    })
    if (recommendationInteractionEvents.length > 0) {
      sessionMemory = appendMemoryEvents(sessionMemory, recommendationInteractionEvents)
    }
    chatDebugLogger.stage('recommendation_interaction_events', {
      eventCount: recommendationInteractionEvents.length,
      events: recommendationInteractionEvents,
    })
    const refinementReferenceBlocked = !!state.refinementIntent &&
      !!recommendationReferenceResult &&
      recommendationReferenceResult.status !== 'resolved'
    const refinementDelta = refinementReferenceBlocked
      ? undefined
      : applyRefinementIntentDelta(state, recommendationReferenceResult)
    const stateDrivenRefinementNote = refinementDelta?.note
    chatDebugLogger.stage('refinement_delta', {
      refinementReferenceBlocked,
      refinementIntent: state.refinementIntent,
      refinementDelta,
      stateDrivenRefinementNote,
    })

    // 1c. If user specified a concrete month/date, clear earliestAvailable and vice versa
    if (stateUpdate.month) {
      state.earliestAvailable = undefined
      state.startDate = undefined
      state.endDate = undefined
      state.pendingAvailabilityConfirmation = undefined
      state.pendingAvailabilityAction = undefined
      if (state.conversationMemory) {
        state.conversationMemory.pendingDecision = undefined
      }
    }

    if (stateUpdate.startDate) {
      state.earliestAvailable = undefined
      state.month = undefined
    }

    if (state.startDate && state.durationDays && (stateUpdate.durationDays || !state.endDate) && !stateUpdate.endDate) {
      state.endDate = addDays(state.startDate, state.durationDays - 1)
      state.month = undefined
    }

    const shouldFindEarliestAvailability =
      !confirmedPendingAvailability &&
      !answeredNonTimingField &&
      !!(
        stateUpdate.earliestAvailable ||
        (
          incomingState.pendingAvailabilityAction === 'find_earliest_availability' &&
          !hasSpecificUserUpdate(stateUpdate)
        ) ||
        (
          incomingState.pendingAvailabilityAction === 'find_earliest_availability' &&
          stateUpdate.durationDays &&
          stateUpdate.availabilityQuestion === 'longest_duration'
        )
      )

    if (shouldFindEarliestAvailability) {
      state.month = undefined
      state.startDate = undefined
      state.endDate = undefined
    }

    if (shouldFindEarliestAvailability) {
      const earliestResults = await findEarliestAvailableCamper(state)
      sessionMemory = rememberSessionAvailability(
        sessionMemory,
        getFirstAvailableResult(earliestResults),
        'fallback_earliest',
        state,
      )
      applyEarliestPendingAvailability(state, earliestResults)
      state.earliestAvailable = undefined
      state.lastAskedField = incomingState.lastAskedField
      state.pendingAvailabilityAction = undefined
      flowState = updateFlowForResponse(flowState, state, 'availability', null, false)

      await chatDebugLogger.finish('early_availability_earliest', {
        resultCount: earliestResults.length,
        state,
        flowState,
        sessionMemory,
      })
      return NextResponse.json({
        reply: buildEarliestAvailabilityConfirmation(state, earliestResults),
        recommendations: [],
        availability: [],
        links: [],
        updatedState: state,
        updatedFlowState: flowState,
        updatedSessionMemory: sessionMemory,
      })
    }

    if (
      (stateUpdate.availabilityQuestion === 'remembered_slot_duration' ||
        stateUpdate.referenceTarget === 'previousAvailability' ||
        stateUpdate.referenceTarget === 'lastAvailability') &&
      !confirmedPendingAvailability
    ) {
      const sessionReference = resolveSessionAvailabilityReference(state, sessionMemory)
      const referencedSlot = sessionReference
        ? sessionAvailabilityToMemorySlot(sessionReference.result)
        : getReferencedAvailabilitySlot(state)
      const compatibility = sessionReference?.compatibility ?? { status: 'compatible' as const, reasons: [] }
      const usableReference = compatibility.status === 'compatible' || compatibility.status === 'compatible_relaxed'
      if (referencedSlot && usableReference) {
        applyAvailabilitySlotConfirmation(state, referencedSlot)
      } else if (sessionReference) {
        sessionMemory = rememberStaleAvailabilityResult(sessionMemory, sessionReference.result)
      }
      state.lastAskedField = incomingState.lastAskedField
      state.pendingAvailabilityAction = undefined
      flowState = updateFlowForResponse(flowState, state, 'availability', null, false)

      await chatDebugLogger.finish('early_availability_remembered_slot', {
        referencedSlot,
        compatibility,
        state,
        flowState,
        sessionMemory,
      })
      return NextResponse.json({
        reply: buildRememberedSlotDurationReply(referencedSlot, compatibility),
        recommendations: [],
        availability: [],
        links: [],
        updatedState: state,
        updatedFlowState: flowState,
        updatedSessionMemory: sessionMemory,
      })
    }

    if (
      stateUpdate.availabilityQuestion === 'longest_duration' &&
      !confirmedPendingAvailability &&
      (state.month || (state.startDate && state.endDate))
    ) {
      const longestResults = await searchAvailableCampers({
        ...state,
        durationDays: undefined,
        startDate: state.month ? undefined : state.startDate,
        endDate: state.month ? undefined : state.endDate,
      })
      sessionMemory = rememberSessionAvailability(
        sessionMemory,
        getLongestAvailableSlot(longestResults),
        'longest',
        state,
      )
      applyLongestPendingAvailability(state, longestResults)
      state.lastAskedField = incomingState.lastAskedField
      state.pendingAvailabilityAction = undefined
      flowState = updateFlowForResponse(flowState, state, 'availability', null, false)

      await chatDebugLogger.finish('early_availability_longest_duration', {
        resultCount: longestResults.length,
        state,
        flowState,
        sessionMemory,
      })
      return NextResponse.json({
        reply: buildLongestAvailableDurationReply(state, longestResults),
        recommendations: [],
        availability: [],
        links: [],
        updatedState: state,
        updatedFlowState: flowState,
        updatedSessionMemory: sessionMemory,
      })
    }

    // 2. Detect specific camper availability query ("ez mikor elérhető?" after seeing a card)
    const targetSlug = state.selectedCamperSlug
      ?? (state.intent === 'availability' ? (state.lastShownCamperSlug ?? null) : null)
    const hasRefinementSignal = !!stateUpdate.refinementIntent
    // Refinement overrides specific camper path — user is asking for a different recommendation
    const isSpecificCamperQuery = !!targetSlug &&
      state.intent === 'availability' &&
      !hasRefinementSignal

    // 3. Determine next required question — skip checklist for specific camper queries
    const hasRecommendationData = !!(
      state.month || state.startDate || state.durationDays || state.passengers ||
      state.campingType || hasWildCampingCapability(state) ||
      state.flexibleCriteria?.months?.length ||
      state.flexibleCriteria?.preferredStartWindows?.length ||
      hasPreferenceContext(state) ||
      state.earliestAvailable
    )
    const isChecklistFlow = !isSpecificCamperQuery && (
      state.intent === 'recommendation' ||
      state.intent === 'availability' ||
      (!state.intent && hasRecommendationData)
    )
    const nextQuestionData: NextQuestion | null = isChecklistFlow ? getNextMissingQuestion(state) : null
    const nextQuestion = nextQuestionData?.question ?? null
    chatDebugLogger.stage('checklist_decision', {
      targetSlug,
      isSpecificCamperQuery,
      hasRefinementSignal,
      hasRecommendationData,
      isChecklistFlow,
      nextQuestionData,
      nextQuestion,
    })

    // Save which field we just asked about so extraction can interpret the next bare answer
    const refinementSignal = hasRefinementSignal

    if (nextQuestionData && resolveMode(state, nextQuestion, refinementSignal) === 'ask_next_question') {
      state.lastAskedField = nextQuestionData.field
      ensureConversationMemory(state).pendingDecision = {
        type: 'checklist_question',
        field: nextQuestionData.field,
        label: nextQuestionData.question,
      }
      ensureConversationMemory(state).lastAssistantOffer = {
        type: 'checklist_question',
        label: nextQuestionData.question,
      }
    } else if (!nextQuestionData && answeredCurrentField) {
      state.lastAskedField = undefined
    }

    const shouldProgressivelyCheckAvailability =
      !isSpecificCamperQuery &&
      isChecklistFlow &&
      !!nextQuestionData &&
      !!(state.month || (state.startDate && state.endDate)) &&
      (nextQuestionData.field === 'durationDays' || nextQuestionData.field === 'passengers')

    if (shouldProgressivelyCheckAvailability) {
      const progressiveResults = (state.earliestAvailable
        ? await findEarliestAvailableCamper(state)
        : await searchAvailableCampers(state)) ?? []
      sessionMemory = rememberSessionAvailability(
        sessionMemory,
        getFirstAvailableResult(progressiveResults),
        state.earliestAvailable ? 'fallback_earliest' : 'availability_search',
        state,
      )
      const progressiveReply = buildProgressiveAvailabilityReply(
        state,
        nextQuestionData,
        progressiveResults.length > 0,
      )

      if (progressiveReply) {
        if (progressiveResults.length === 0) {
          state.lastAskedField = incomingState.lastAskedField
          state.pendingAvailabilityAction = 'find_earliest_availability'
          ensureConversationMemory(state).pendingDecision = {
            type: 'alternative_search',
            label: 'find earliest alternative availability',
          }
          ensureConversationMemory(state).lastAssistantOffer = {
            type: 'alternative_search',
            label: 'find earliest alternative availability',
          }
        } else {
          state.pendingAvailabilityAction = undefined
        }
        const updatedFlowState = updateFlowForResponse(flowState, state, 'ask_next_question', nextQuestionData, false)
        await chatDebugLogger.finish('early_progressive_availability', {
          progressiveResultCount: progressiveResults.length,
          state,
          flowState: updatedFlowState,
          sessionMemory,
          nextQuestionData,
        })
        return NextResponse.json({
          reply: progressiveReply,
          recommendations: [],
          availability: [],
          links: [],
          updatedState: state,
          updatedFlowState,
          updatedSessionMemory: sessionMemory,
        })
      }
    }

    // 3b. Detect if a field was just skipped this turn (for GPT acknowledgement)
    const justSkippedField = stateUpdate.skippedChecklist?.[0]

    // 4. Determine mode
    const mode = isSpecificCamperQuery ? 'availability' : resolveMode(state, nextQuestion, refinementSignal)
    const effectiveMode = isFaqInterruption ? 'faq' : mode
    chatDebugLogger.stage('mode_resolved', {
      mode,
      effectiveMode,
      isFaqInterruption,
      justSkippedField,
    })

    // 4b. Load FAQ items from Supabase when mode is faq
    let faqItems: FaqItem[] | undefined
    if (effectiveMode === 'faq') {
      faqItems = await loadFaqItems()
    }

    // 4c. Load catalog summary (prices per type) when mode is catalog
    let catalogSummary: CatalogEntry[] | undefined
    if (effectiveMode === 'catalog') {
      catalogSummary = await loadCatalogSummary()
    }
    chatDebugLogger.stage('context_data_loaded', {
      faqItemCount: faqItems?.length ?? 0,
      catalogEntryCount: catalogSummary?.length ?? 0,
    })

    // 5. Fetch available campers
    let camperResults: CamperResult[] = []
    let searchType: SearchType = 'specific'
    let requestedMonth: string | undefined
    let branchSummaries: BranchSearchSummary[] | undefined
    let evaluationResult: CamperEvaluationResult | undefined
    let evaluationStatus: EvaluationStatus | undefined

    const recommendationEvaluation = await runRecommendationEvaluation({
      effectiveMode,
      state,
      refinementReferenceBlocked,
      onError: error => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Camper evaluation engine failed:', error)
        }
      },
    })
    evaluationResult = recommendationEvaluation.evaluationResult
    evaluationStatus = recommendationEvaluation.evaluationStatus
    chatDebugLogger.stage('recommendation_evaluation', {
      evaluationStatus,
      topRecommendationSlugs: evaluationResult?.topRecommendations.map(item => item.camperSlug),
      evaluationCount: evaluationResult?.evaluations.length ?? 0,
    })

    if (isSpecificCamperQuery && targetSlug) {
      // Specific camper availability: search only for that one slug
      camperResults = await getSpecificCamperAvailability(targetSlug, state)

      // If month was given but returned empty → fall back to full 6-month window
      if (camperResults.length === 0 && state.month) {
        requestedMonth = state.month
        camperResults = await getSpecificCamperAvailability(targetSlug, { ...state, month: undefined })
        searchType = 'fallback_earliest'
      }
    } else if (effectiveMode === 'availability' || (effectiveMode === 'recommend' && evaluationStatus === 'failed_fallback_used')) {
      const hasExactRange = !!(state.startDate && state.endDate)
      const flexibleBranches = !state.earliestAvailable && !hasExactRange
        ? createFlexibleSearchBranches(state)
        : null

      if (flexibleBranches) {
        searchType = 'branch'
        branchSummaries = []
        const mergedResults: CamperResult[] = []
        for (const branch of flexibleBranches) {
          const branchResults = await searchAvailableCampers(branch.state)
          branchSummaries.push({
            label: branch.label,
            criteria: createAvailabilityCriteria(branch.state),
            resultCount: branchResults.length,
          })
          sessionMemory = rememberSessionAvailability(
            sessionMemory,
            getFirstAvailableResult(branchResults),
            'availability_search',
            branch.state,
          )
          mergedResults.push(...branchResults)
        }
        camperResults = mergedResults
      } else if (state.earliestAvailable) {
        camperResults = await findEarliestAvailableCamper(state)
        searchType = 'earliest'
      } else {
        camperResults = await searchAvailableCampers(state)

        if (camperResults.length === 0 && hasExactRange && !nextQuestion) {
          const fallbackResults = await findEarliestAvailableCamper(state)
          sessionMemory = rememberSessionAvailability(
            sessionMemory,
            getFirstAvailableResult(fallbackResults),
            'fallback_earliest',
            state,
          )
          applyEarliestPendingAvailability(state, fallbackResults, 'fallback_earliest')
          searchType = 'fallback_earliest'

          await chatDebugLogger.finish('early_availability_exact_range_fallback_shift', {
            fallbackResultCount: fallbackResults.length,
            state,
            flowState,
            sessionMemory,
          })
          return NextResponse.json({
            reply: buildFallbackAvailabilityShiftConfirmation(state, fallbackResults),
            recommendations: [],
            availability: [],
            links: [],
            updatedState: state,
            updatedFlowState: updateFlowForResponse(flowState, state, 'availability', null, false),
            updatedSessionMemory: sessionMemory,
          })
        }

        if (camperResults.length === 0 && !hasExactRange) {
          requestedMonth = state.month  // undefined if no month → no "requested month full" note
          camperResults = await findEarliestAvailableCamper(state)
          sessionMemory = rememberSessionAvailability(
            sessionMemory,
            getFirstAvailableResult(camperResults),
            'fallback_earliest',
            state,
          )
          searchType = 'fallback_earliest'
        }
      }
    }

    chatDebugLogger.stage('availability_search_completed', {
      camperResultCount: camperResults.length,
      searchType,
      requestedMonth,
      branchSummaries,
      isSpecificCamperQuery,
      targetSlug,
    })

    if (effectiveMode === 'availability') {
      try {
        evaluationResult = await evaluateCampers(state)
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Camper evaluation engine failed:', error)
        }
      }
    }

    if (effectiveMode === 'availability' && camperResults.length > 0 && !branchSummaries?.length) {
      sessionMemory = rememberSessionAvailability(
        sessionMemory,
        getFirstAvailableResult(camperResults),
        isSpecificCamperQuery ? 'availability_search' : searchType === 'fallback_earliest' ? 'fallback_earliest' : 'availability_search',
        state,
      )
      if (isSpecificCamperQuery && sessionMemory.lastAvailabilityResult) {
        sessionMemory.lastSpecificCamperAvailability = sessionMemory.lastAvailabilityResult
      }
    }

    // 5b. Build user-facing recommendation source
    const recommendationProjection = buildRecommendationProjection({
      effectiveMode,
      state,
      stateUpdate,
      evaluationResult,
      camperResults,
      stateDrivenRefinementNote,
    })
    const {
      backendSelectedRecommendations,
      noResultReasonSummary,
      enginePrimaryRecommendations,
      displayResults,
      allowedSlugs,
      refinementNote,
    } = recommendationProjection
    chatDebugLogger.stage('recommendation_projection', {
      backendSelectedRecommendationSlugs: backendSelectedRecommendations?.map(item => item.slug),
      noResultReasonSummary,
      enginePrimaryRecommendations,
      displayResultSlugs: displayResults.map(item => item.slug),
      allowedCamperSlugs: [...allowedSlugs],
      refinementNote,
    })

    // Offer extras only on the first successful recommendation (when there are results and not yet offered)
    const offerExtras = effectiveMode === 'recommend' && displayResults.length > 0 && !state.extrasOffered

    // 5d. Load extras from Supabase when offering them
    let extrasItems: ExtraItem[] | undefined
    if (offerExtras) {
      extrasItems = await loadExtras()
    }

    // 5c. Decide if a summary before the recommendation is warranted
    const isFirstRecommendation = (state.alreadyRecommendedSlugs?.length ?? 0) === 0
    const shouldSummarize = effectiveMode === 'recommend' && (
      (isFirstRecommendation && countKnownFields(state) >= 3) ||
      changedAvailabilityFields.length >= 2
    )
    const refinementContext = buildRefinementContext(
      state,
      recommendationReferenceResult,
      refinementDelta,
      effectiveMode,
      backendSelectedRecommendations,
      evaluationResult,
    )

    // 6. Build GPT context
    const ctx = assembleGptContext({
      state,
      flowState,
      sessionMemory,
      nextQuestion,
      camperResults: displayResults,
      allowedCamperSlugs: [...allowedSlugs],
      mode,
      effectiveMode,
      searchType,
      requestedMonth,
      isSpecificCamperQuery,
      specificCamperSlug: targetSlug,
      enginePrimaryRecommendations,
      refinementNote,
      offerExtras,
      extrasItems,
      catalogSummary,
      faqItems,
      justSkippedField,
      shouldSummarize,
      branchSummaries,
      evaluationStatus,
      backendSelectedRecommendations,
      noResultReasonSummary,
      recommendationReferenceResult,
      recommendationReferenceExplanation,
      refinementContext,
    })
    chatDebugLogger.stage('gpt_context_assembled', {
      mode: ctx.mode,
      allowedCamperSlugs: ctx.allowedCamperSlugs,
      camperResultCount: ctx.camperResults.length,
      backendSelectedRecommendationSlugs: ctx.backendSelectedRecommendations?.map(item => item.slug),
      nextQuestion: ctx.nextQuestion,
      evaluationStatus: ctx.evaluationStatus,
      recommendationReferenceStatus: ctx.recommendationReferenceResult?.status,
      refinementContext: ctx.refinementContext,
    })

    // 7. Call GPT
    const contextBlock = buildContextBlock(ctx)
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
        ...history,
        { role: 'user', content: message },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
      temperature: 0.5,
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const output = validateGptOutput(raw, allowedSlugs, effectiveMode)
    chatDebugLogger.stage('gpt_output_validated', {
      raw,
      output,
      allowedCamperSlugs: [...allowedSlugs],
    })

    const replySafety = applyReplySafety({
      reply: output.reply,
      mode,
      effectiveMode,
      state,
      nextQuestion,
      nextQuestionField: nextQuestionData?.field ?? null,
      isSpecificCamperQuery,
    })
    output.reply = replySafety.reply

    if (replySafety.suppressRecommendations) {
      output.recommendations = []
    }
    chatDebugLogger.stage('reply_safety_applied', {
      suppressRecommendations: replySafety.suppressRecommendations,
      recommendationSlugs: output.recommendations.map(item => item.slug),
    })

    // 8. Track newly recommended slugs + last shown slug + price + extras flag in state
    const newSlugs = output.recommendations.map(r => r.slug)
    if (newSlugs.length > 0) {
      state.alreadyRecommendedSlugs = [
        ...new Set([...(state.alreadyRecommendedSlugs ?? []), ...newSlugs]),
      ]
      state.lastShownCamperSlug = newSlugs[0]
      const lastShownCamper = displayResults.find(c => c.slug === newSlugs[0])
        ?? camperResults.find(c => c.slug === newSlugs[0])
      if (lastShownCamper) {
        const lastShownPrice = positivePriceOrUndefined(lastShownCamper.price_per_day)
        if (lastShownPrice) {
          state.lastShownPrice = lastShownPrice
        } else {
          delete state.lastShownPrice
        }
      }
      if (offerExtras) {
        state.extrasOffered = true
      }
      const reasonBySlug = Object.fromEntries(output.recommendations.map(r => [r.slug, r.reason]))
      const shownCampers = newSlugs
        .map(slug => displayResults.find(c => c.slug === slug) ?? camperResults.find(c => c.slug === slug))
        .filter((camper): camper is CamperResult => !!camper)
      rememberMentionedCampers(state, shownCampers, reasonBySlug)
      const backendRecommendationBySlug = new Map(
        (backendSelectedRecommendations ?? []).map(recommendation => [recommendation.slug, recommendation]),
      )
      const recommendationMemoryInputs = newSlugs
        .map(slug => {
          const backendRecommendation = backendRecommendationBySlug.get(slug)
          if (backendRecommendation) return recommendationMemoryInputFromBackend(backendRecommendation)
          const camper = shownCampers.find(item => item.slug === slug)
          return camper ? recommendationMemoryInputFromCamper(camper) : undefined
        })
        .filter((input): input is RecommendationMemoryInput => !!input)
      sessionMemory = rememberSessionRecommendation(sessionMemory, recommendationMemoryInputs, state)
    }

    // 9. Enrich recommendations with camper data
    const recommendationSourceResults = enginePrimaryRecommendations ? displayResults : [...camperResults, ...displayResults]
    const camperMap = Object.fromEntries(recommendationSourceResults.map(c => [c.slug, c]))
    const recommendations: EnrichedRecommendation[] = output.recommendations
      .filter(r => camperMap[r.slug])
      .map(r => ({
        slug: r.slug,
        text: r.reason,
        name: camperMap[r.slug].name,
        image_url: camperMap[r.slug].image_url,
        price_per_day: camperMap[r.slug].price_per_day,
        type: camperMap[r.slug].type,
        beds: camperMap[r.slug].beds,
      }))

    // 10. Build availability slots for UI (mode = availability)
    const availability: AvailabilitySlot[] = effectiveMode === 'availability'
      ? camperResults.flatMap(c =>
          c.availableSlots.map(slot => ({
            slug: c.slug,
            name: c.name,
            image_url: c.image_url,
            price_per_day: c.price_per_day,
            type: c.type,
            beds: c.beds,
            from: slot.from,
            to: slot.to,
            days: slot.days,
          })),
        )
      : []

    flowState = updateFlowForResponse(flowState, state, effectiveMode, nextQuestionData, isFaqInterruption)

    await chatDebugLogger.finish('success', {
      reply: output.reply,
      recommendationSlugs: recommendations.map(item => item.slug),
      availabilitySlotCount: availability.length,
      links: output.links,
      updatedState: state,
      updatedFlowState: flowState,
      updatedSessionMemory: sessionMemory,
      mode,
      effectiveMode,
      evaluationStatus,
    })
    return NextResponse.json({
      reply: output.reply,
      recommendations,
      availability,
      links: output.links,
      updatedState: state,
      updatedFlowState: flowState,
      updatedSessionMemory: sessionMemory,
    })
  } catch (err) {
    await chatDebugLogger?.error(err, {
      reply: FALLBACK_OUTPUT.reply,
      recommendations: [],
      availability: [],
      links: [],
    })
    console.error('[chat/route]', err)
    return NextResponse.json({
      reply: FALLBACK_OUTPUT.reply,
      recommendations: [],
      availability: [],
      links: [],
    })
  }
}
