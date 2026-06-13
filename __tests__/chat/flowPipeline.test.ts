import { describe, expect, it } from 'vitest'
import type { ConversationState, FlowState } from '@/lib/chat/state'
import {
  normalizeFlowFromIntent,
  resolveMode,
  updateFlowForResponse,
} from '@/lib/chat/flowPipeline'

describe('flowPipeline', () => {
  it('defaults empty state to catalog instead of recommendation', () => {
    expect(resolveMode({}, null)).toBe('catalog')
  })

  it('uses ask_next_question when a backend nextQuestion exists', () => {
    expect(resolveMode({ intent: 'recommendation' }, 'Mikor mennél?')).toBe('ask_next_question')
  })

  it('does not override faq, booking or catalog with nextQuestion', () => {
    expect(resolveMode({ intent: 'faq' }, 'Mikor mennél?')).toBe('faq')
    expect(resolveMode({ intent: 'booking' }, 'Mikor mennél?')).toBe('booking')
    expect(resolveMode({ intent: 'catalog' }, 'Mikor mennél?')).toBe('catalog')
  })

  it('routes canonical wild camping capability context to recommendation mode', () => {
    const state: ConversationState = {
      capabilityPreferences: [{
        key: 'wild_camping',
        strength: 'hard',
        sourceText: 'vadkempingeznénk',
      }],
    }

    expect(resolveMode(state, null)).toBe('recommend')
  })

  it('routes canonical preference context to recommendation mode without legacy raw fields', () => {
    expect(resolveMode({
      featurePreferences: [{ key: 'solar_panel', strength: 'soft', sourceText: 'napelem' }],
    }, null)).toBe('recommend')

    expect(resolveMode({
      pricingPreference: { intent: 'cheaper', strength: 'soft', sourceText: 'olcsóbb' },
    }, null)).toBe('recommend')
  })

  it('routes flexible timing context to recommendation mode', () => {
    expect(resolveMode({
      flexibleCriteria: {
        preferredStartWindows: [{
          startDate: '2026-09-21',
          endDate: '2026-09-30',
          precision: 'month_part',
        }],
      },
    }, null)).toBe('recommend')
  })

  it('routes refinement signal to recommendation mode when no question blocks it', () => {
    expect(resolveMode({ intent: 'availability' }, null, true)).toBe('recommend')
  })

  it('normalizes missing intent to recommendation flow for checklist continuation', () => {
    expect(normalizeFlowFromIntent(undefined)).toBe('recommendation')
    expect(normalizeFlowFromIntent('catalog')).toBe('catalog')
  })

  it('stores pending checklist question in FlowState', () => {
    const flowState = updateFlowForResponse(
      {},
      { intent: 'recommendation' },
      'ask_next_question',
      { field: 'month', question: 'Mikor mennél?' },
      false,
    )

    expect(flowState).toEqual({
      activeFlow: 'recommendation',
      activeStep: 'checklist',
      pendingQuestionField: 'month',
      pendingQuestionText: 'Mikor mennél?',
      canResumePreviousFlow: false,
    })
  })

  it('marks FAQ interruption as resumable side topic', () => {
    const flowState: FlowState = {
      activeFlow: 'recommendation',
      activeStep: 'checklist',
      pendingQuestionField: 'durationDays',
    }

    expect(updateFlowForResponse(
      flowState,
      { intent: 'recommendation' },
      'faq',
      null,
      true,
    )).toEqual({
      activeFlow: 'recommendation',
      activeStep: 'checklist',
      pendingQuestionField: 'durationDays',
      lastSideTopic: 'faq',
      canResumePreviousFlow: true,
    })
  })

  it('clears pending question when response leaves checklist mode', () => {
    expect(updateFlowForResponse(
      {
        activeFlow: 'recommendation',
        activeStep: 'checklist',
        pendingQuestionField: 'month',
        pendingQuestionText: 'Mikor mennél?',
      },
      { intent: 'recommendation' },
      'recommend',
      null,
      false,
    )).toEqual({
      activeFlow: 'recommendation',
      activeStep: 'recommendation',
      pendingQuestionField: undefined,
      pendingQuestionText: undefined,
      canResumePreviousFlow: false,
    })
  })
})
