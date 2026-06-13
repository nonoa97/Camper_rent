import { describe, expect, it } from 'vitest'

import { buildExtractionPrompt } from '@/lib/chat/extractorPrompt'
import type { ConversationState } from '@/lib/chat/state'

describe('buildExtractionPrompt', () => {
  it('keeps canonical preference and boundary contract tokens in the extracted prompt', () => {
    const prompt = buildExtractionPrompt({} as ConversationState)

    expect(prompt).toContain('"featurePreferences"')
    expect(prompt).toContain('"attributePreferences"')
    expect(prompt).toContain('"capabilityPreferences"')
    expect(prompt).toContain('"pricingPreference"')
    expect(prompt).toContain('Use canonical preference fields first.')
    expect(prompt).toContain('Do not force every user need into featurePreferences.')
    expect(prompt).toContain('wild camping usage goal')
    expect(prompt).toContain('automatic transmission / automata váltó / gearbox')
    expect(prompt).toContain('Return ONLY valid JSON. Nothing else.')
  })

  it('includes the focused current-state context without requiring the full route', () => {
    const prompt = buildExtractionPrompt({
      month: '2026-07',
      passengers: 4,
      lastAskedField: 'passengers',
      lastShownCamperSlug: 'atlas',
    } as ConversationState)

    expect(prompt).toContain('"month":"2026-07"')
    expect(prompt).toContain('"passengers":4')
    expect(prompt).toContain('"lastAskedField":"passengers"')
    expect(prompt).toContain('"lastShownCamperSlug":"atlas"')
  })

  it('uses canonical availability options context before the legacy availability slots mirror', () => {
    const prompt = buildExtractionPrompt({
      conversationMemory: {
        mentionedAvailabilityOptions: [
          {
            startDate: '2026-07-10',
            endDate: '2026-07-17',
            durationDays: 7,
            camperSlug: 'canonical-camper',
          },
        ],
      },
      lastAvailabilitySlots: [
        {
          startDate: '2026-08-01',
          endDate: '2026-08-08',
          durationDays: 7,
          camperSlug: 'legacy-camper',
        },
      ],
    } as ConversationState)

    expect(prompt).toContain('"availabilityOptionsContext"')
    expect(prompt).toContain('canonical-camper')
    expect(prompt).not.toContain('"legacyAvailabilitySlotsContext"')
    expect(prompt).not.toContain('legacy-camper')
  })

  it('keeps legacy availability slots as fallback context for old client-carried state', () => {
    const prompt = buildExtractionPrompt({
      lastAvailabilitySlots: [
        {
          startDate: '2026-08-01',
          endDate: '2026-08-08',
          durationDays: 7,
          camperSlug: 'legacy-camper',
        },
      ],
    } as ConversationState)

    expect(prompt).toContain('"availabilityOptionsContext"')
    expect(prompt).toContain('legacy-camper')
    expect(prompt).not.toContain('"legacyAvailabilitySlotsContext"')
  })

  it('instructs seasonal timing as flexible months without inventing trip defaults', () => {
    const prompt = buildExtractionPrompt({} as ConversationState)

    expect(prompt).toContain('valamikor nyáron')
    expect(prompt).toContain('flexibleCriteria.months')
    expect(prompt).toContain('"preferredStartWindows"')
    expect(prompt).toContain('Natural timing windows are preferred start windows')
    expect(prompt).toContain('do not set month unless the user named one exact month')
    expect(prompt).toContain('do not invent durationDays, passengers, campingType, or extraRequirementsAsked')
    expect(prompt).toContain('season beginning / middle / end narrows the season')
    expect(prompt).toContain('"szeptember környékén"')
    expect(prompt).toContain('previous/current/next month')
    expect(prompt).not.toMatch(/nyáron\s*→\s*\d{4}-\d{2}/)
    expect(prompt).not.toMatch(/ősszel\s*→\s*\d{4}-\d{2}/)
  })
})
