import { describe, expect, it } from 'vitest'
import { applyReplySafety } from '@/lib/chat/replySafety'
import { ConversationState } from '@/lib/chat/state'

describe('replySafety', () => {
  it('removes checklist questions from FAQ replies', () => {
    const result = applyReplySafety({
      reply: 'A vadkemping röviden kempingen kívüli megállás. Inkább vadkempingeznétek, vagy kempinghelyen állnátok meg?',
      mode: 'faq',
      effectiveMode: 'faq',
      state: {},
    })

    expect(result.reply).toBe('A vadkemping röviden kempingen kívüli megállás.')
    expect(result.suppressRecommendations).toBe(false)
  })

  it('does not duplicate the next checklist question', () => {
    const question = 'Inkább vadkempingeznétek, vagy kempinghelyen állnátok meg?'
    const result = applyReplySafety({
      reply: `Oké, értem. ${question} ${question}`,
      mode: 'ask_next_question',
      effectiveMode: 'ask_next_question',
      state: {},
      nextQuestion: question,
      nextQuestionField: 'campingType',
    })

    expect(result.reply).toBe(`Oké, értem. ${question}`)
  })

  it('keeps a natural rephrasing of the next checklist question', () => {
    const result = applyReplySafety({
      reply: 'Megvan, 22 nap. Rendben, hányan utaznátok összesen?',
      mode: 'ask_next_question',
      effectiveMode: 'ask_next_question',
      state: { durationDays: 22 },
      nextQuestion: 'Hány fővel utaznál?',
      nextQuestionField: 'passengers',
    })

    expect(result.reply).toBe('Megvan, 22 nap. Rendben, hányan utaznátok összesen?')
  })

  it('still appends the backend checklist question when GPT asks no question', () => {
    const result = applyReplySafety({
      reply: 'Megvan, 22 nap.',
      mode: 'ask_next_question',
      effectiveMode: 'ask_next_question',
      state: { durationDays: 22 },
      nextQuestion: 'Hány fővel utaznál?',
      nextQuestionField: 'passengers',
    })

    expect(result.reply).toBe('Megvan, 22 nap. Hány fővel utaznál?')
  })

  it('removes misleading no-info text in ask_next_question mode', () => {
    const result = applyReplySafety({
      reply: 'Erről jelenleg nincs pontos információm. Hány napra tervezed?',
      mode: 'ask_next_question',
      effectiveMode: 'ask_next_question',
      state: {},
      nextQuestion: 'Hány napra tervezed?',
      nextQuestionField: 'durationDays',
    })

    expect(result.reply).toBe('Hány napra tervezed?')
  })

  it('signals recommendation suppression for availability mode', () => {
    const result = applyReplySafety({
      reply: 'Megnézem az elérhetőséget.',
      mode: 'availability',
      effectiveMode: 'availability',
      state: {},
    })

    expect(result.reply).toBe('Megnézem az elérhetőséget.')
    expect(result.suppressRecommendations).toBe(true)
  })

  it('leaves a valid reply unchanged', () => {
    const state: ConversationState = {
      month: '2026-07',
      durationDays: 7,
    }

    const result = applyReplySafety({
      reply: 'Rendben, nézem az opciókat.',
      mode: 'recommend',
      effectiveMode: 'recommend',
      state,
    })

    expect(result.reply).toBe('Rendben, nézem az opciókat.')
    expect(result.suppressRecommendations).toBe(false)
  })
})
