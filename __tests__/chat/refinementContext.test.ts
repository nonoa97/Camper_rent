import { describe, expect, it } from 'vitest'

import {
  buildRefinementContext,
  getRefinementRerunSkippedReason,
  summarizeRecommendationCompatibility,
  summarizeRecommendationReferenceResolution,
  summarizeReferencedRecommendationTarget,
  summarizeRefinementStateDelta,
} from '@/lib/chat/refinementContext'
import type { ConversationState } from '@/lib/chat/state'
import type { BackendSelectedRecommendation } from '@/lib/chat/evaluationContext'
import type { CamperEvaluationResult } from '@/lib/chat/evaluation'
import type { RecommendationReferenceResult } from '@/lib/chat/recommendationReference'

const state: ConversationState = {
  refinementIntent: {
    intent: 'cheaper',
    sourceText: 'van olcsóbb?',
  },
}

const resolvedReference: RecommendationReferenceResult = {
  status: 'resolved',
  reasons: ['last_recommendation'],
  target: {
    optionId: 'option-1',
    camperSlug: 'hobby-t75hf',
    camperName: 'Hobby T75HF',
    shownIndex: 1,
  } as RecommendationReferenceResult['target'],
  compatibility: {
    status: 'compatible_relaxed',
    reasons: ['passengers_decreased'],
  },
}

const recommendations = [
  { slug: 'challenger-nordic-377' },
  { slug: 'hobby-t75hf' },
] as BackendSelectedRecommendation[]

const evaluationResult = {
  topRecommendations: [],
} as unknown as CamperEvaluationResult

describe('refinementContext', () => {
  it('summarizes a resolved referenced recommendation target', () => {
    expect(summarizeReferencedRecommendationTarget(resolvedReference)).toEqual({
      optionId: 'option-1',
      camperSlug: 'hobby-t75hf',
      camperName: 'Hobby T75HF',
      shownIndex: 1,
    })
  })

  it('summarizes reference resolution and ambiguous candidate count', () => {
    const result: RecommendationReferenceResult = {
      status: 'ambiguous',
      reasons: ['multiple_feature_matches'],
      candidates: [
        { optionId: 'option-1', camperSlug: 'a', camperName: 'A' },
        { optionId: 'option-2', camperSlug: 'b', camperName: 'B' },
      ] as RecommendationReferenceResult['candidates'],
    }

    expect(summarizeRecommendationReferenceResolution(result)).toEqual({
      status: 'ambiguous',
      reasons: ['multiple_feature_matches'],
      candidateCount: 2,
    })
  })

  it('summarizes compatibility only for resolved references', () => {
    expect(summarizeRecommendationCompatibility(resolvedReference)).toEqual({
      status: 'compatible_relaxed',
      reasons: ['passengers_decreased'],
    })

    expect(summarizeRecommendationCompatibility({
      status: 'not_found',
      reasons: ['empty_memory'],
    })).toBeUndefined()
  })

  it('keeps the refinement delta summary shape unchanged', () => {
    expect(summarizeRefinementStateDelta({
      stateDeltaSummary: ['pricingPreference.intent=cheaper'],
    })).toEqual(['pricingPreference.intent=cheaper'])
    expect(summarizeRefinementStateDelta(undefined)).toEqual([])
  })

  it('returns the existing rerun skipped reasons', () => {
    expect(getRefinementRerunSkippedReason(
      state.refinementIntent,
      { status: 'ambiguous', reasons: ['multiple_matches'] },
      'recommend',
    )).toBe('ambiguous_reference')

    expect(getRefinementRerunSkippedReason(
      state.refinementIntent,
      { status: 'not_found', reasons: ['empty_memory'] },
      'recommend',
    )).toBe('reference_not_found')

    expect(getRefinementRerunSkippedReason(state.refinementIntent, undefined, 'faq')).toBe('not_recommend_mode')
    expect(getRefinementRerunSkippedReason(state.refinementIntent, undefined, 'recommend')).toBeUndefined()
  })

  it('builds the resolved rerun refinement context without changing field names', () => {
    const context = buildRefinementContext(
      state,
      resolvedReference,
      { stateDeltaSummary: ['pricingPreference.intent=cheaper'] },
      'recommend',
      recommendations,
      evaluationResult,
    )

    expect(context).toEqual({
      refinementIntent: state.refinementIntent,
      sourceText: 'van olcsóbb?',
      referencedTarget: {
        optionId: 'option-1',
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        shownIndex: 1,
      },
      referenceResolution: {
        status: 'resolved',
        reasons: ['last_recommendation'],
        candidateCount: undefined,
      },
      compatibility: {
        status: 'compatible_relaxed',
        reasons: ['passengers_decreased'],
      },
      stateDeltaSummary: ['pricingPreference.intent=cheaper'],
      rerunTriggered: true,
      rerunSkippedReason: undefined,
      newBackendSelectedRecommendations: ['challenger-nordic-377', 'hobby-t75hf'],
    })
  })

  it('keeps ambiguous references as skipped reruns', () => {
    const context = buildRefinementContext(
      state,
      {
        status: 'ambiguous',
        reasons: ['multiple_matches'],
        candidates: [
          { optionId: 'option-1', camperSlug: 'a', camperName: 'A' },
          { optionId: 'option-2', camperSlug: 'b', camperName: 'B' },
        ] as RecommendationReferenceResult['candidates'],
      },
      undefined,
      'recommend',
      recommendations,
      evaluationResult,
    )

    expect(context?.rerunTriggered).toBe(false)
    expect(context?.rerunSkippedReason).toBe('ambiguous_reference')
    expect(context?.referenceResolution?.candidateCount).toBe(2)
  })
})
