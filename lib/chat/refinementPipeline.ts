import type {
  ConversationState,
  MemoryConcernType,
  RefinementIntent,
  RefinementPreference,
} from './state'
import type { CamperResult } from './availability'
import type { RecommendationReferenceResult } from './recommendationReference'
import { positivePriceOrUndefined } from './priceUtils'

export interface RefinementDeltaResult {
  note: string
  stateDeltaSummary: string[]
}

export interface LegacyRefinementResult {
  refined: CamperResult[]
  boundaryReached: boolean
}

const LEGACY_REFINEMENT_INTENTS: RefinementPreference[] = [
  'cheaper',
  'more_expensive',
  'smaller',
  'bigger',
  'different',
]

export const LEGACY_REFINEMENT_BOUNDARY_NOTES: Record<RefinementPreference, string> = {
  cheaper: 'HATÁRESET: nincs olcsóbb megfelelő opció. Mondd el röviden, és ajánlj feltételmódosítást.',
  more_expensive: 'HATÁRESET: nincs drágább megfelelő opció. Mondd el röviden.',
  smaller: 'HATÁRESET: nincs kisebb megfelelő opció. Mondd el röviden.',
  bigger: 'HATÁRESET: nincs nagyobb megfelelő opció. Mondd el röviden.',
  different: 'HATÁRESET: nincs több meg nem mutatott megfelelő opció. Mondd el röviden, és ajánlj feltételmódosítást.',
}

const LEGACY_REFINEMENT_NOTES: Record<RefinementPreference, (lastPrice?: number) => string> = {
  cheaper: lastPrice => `User olcsóbbat kért (előző ár: ${lastPrice ? `${lastPrice.toLocaleString('hu-HU')} Ft/nap` : '?'}). Csak a backend által engedélyezett allowedCamperSlugs opciókat kommunikáld.`,
  more_expensive: lastPrice => `User drágább / prémiumabb opciót kért (előző ár: ${lastPrice ? `${lastPrice.toLocaleString('hu-HU')} Ft/nap` : '?'}).`,
  smaller: () => 'User kisebbet / kompaktabbat kért. Csak a backend által engedélyezett allowedCamperSlugs opciókat kommunikáld.',
  bigger: () => 'User nagyobbat / tágasabbat kért. Csak a backend által engedélyezett allowedCamperSlugs opciókat kommunikáld.',
  different: () => 'User mást kért. Csak a backend által engedélyezett, eddig nem mutatott allowedCamperSlugs opciókat kommunikáld.',
}

function isLegacyRefinementIntent(intent: RefinementIntent['intent'] | undefined): intent is RefinementPreference {
  return !!intent && LEGACY_REFINEMENT_INTENTS.includes(intent as RefinementPreference)
}

export function refinementIntentFromLegacy(
  preference: RefinementPreference | undefined,
  sourceText: string,
): RefinementIntent | undefined {
  if (!preference) return undefined
  return {
    intent: preference,
    sourceText,
  }
}

export function legacyRefinementPreferenceFromUpdate(
  update: Partial<ConversationState>,
): RefinementPreference | undefined {
  if (isLegacyRefinementIntent(update.refinementIntent?.intent)) {
    return update.refinementIntent.intent
  }
  return update.refinementPreference
}

function getResolvedRecommendationTarget(
  result: RecommendationReferenceResult | undefined,
): RecommendationReferenceResult['target'] | undefined {
  return result?.status === 'resolved' ? result.target : undefined
}

function upsertAttributePreference(
  state: ConversationState,
  preference: NonNullable<ConversationState['attributePreferences']>[number],
): void {
  const key = `${preference.key}|${preference.operator ?? ''}|${String(preference.value)}|${preference.strength}|${preference.sourceText}`
  const existing = new Map(
    (state.attributePreferences ?? []).map(item => [
      `${item.key}|${item.operator ?? ''}|${String(item.value)}|${item.strength}|${item.sourceText}`,
      item,
    ]),
  )
  existing.set(key, preference)
  state.attributePreferences = [...existing.values()]
}

export function applyRefinementIntentDelta(
  state: ConversationState,
  recommendationReferenceResult: RecommendationReferenceResult | undefined,
): RefinementDeltaResult | undefined {
  const refinementIntent = state.refinementIntent
  if (!refinementIntent) return undefined

  const target = getResolvedRecommendationTarget(recommendationReferenceResult)
  const targetSlug = target?.camperSlug ?? state.lastShownCamperSlug
  const targetPrice = target?.pricePerDay ?? state.lastShownPrice
  const targetBeds = target?.attributeFacts?.beds ?? undefined
  const strength = refinementIntent.strength ?? 'soft'

  if (targetSlug && recommendationReferenceResult?.status === 'resolved') {
    state.lastShownCamperSlug = targetSlug
  }
  if (typeof targetPrice === 'number') {
    state.lastShownPrice = targetPrice
  }

  switch (refinementIntent.intent) {
    case 'cheaper':
      state.pricingPreference = {
        intent: 'cheaper',
        strength,
        sourceText: refinementIntent.sourceText,
        referencePricePerDay: targetPrice,
      }
      return {
        note: targetSlug
          ? `STATE-DRIVEN REFINEMENT: user asked for a cheaper option relative to ${targetSlug}. Evaluation Engine was rerun with updated ConversationState.`
          : 'STATE-DRIVEN REFINEMENT: user asked for a cheaper option. Evaluation Engine was rerun with updated ConversationState.',
        stateDeltaSummary: ['pricingPreference.intent=cheaper'],
      }

    case 'more_expensive':
      state.pricingPreference = {
        intent: 'premium_ok',
        strength,
        sourceText: refinementIntent.sourceText,
      }
      return {
        note: targetSlug
          ? `STATE-DRIVEN REFINEMENT: user is open to a more expensive option relative to ${targetSlug}. Evaluation Engine was rerun with updated ConversationState.`
          : 'STATE-DRIVEN REFINEMENT: user is open to a more expensive option. Evaluation Engine was rerun with updated ConversationState.',
        stateDeltaSummary: ['pricingPreference.intent=premium_ok'],
      }

    case 'bigger':
      upsertAttributePreference(state, {
        key: 'beds',
        operator: targetBeds != null ? 'gte' : 'preferred',
        value: targetBeds != null ? targetBeds + 1 : Math.max((state.passengers ?? 1) + 1, 2),
        strength,
        sourceText: refinementIntent.sourceText,
      })
      return {
        note: targetSlug
          ? `STATE-DRIVEN REFINEMENT: user asked for a bigger option relative to ${targetSlug}. Evaluation Engine was rerun with updated ConversationState.`
          : 'STATE-DRIVEN REFINEMENT: user asked for a bigger option. Evaluation Engine was rerun with updated ConversationState.',
        stateDeltaSummary: [`attributePreferences.beds=${targetBeds != null ? `gte:${targetBeds + 1}` : 'preferred'}`],
      }

    case 'smaller':
      upsertAttributePreference(state, {
        key: 'beds',
        operator: targetBeds != null ? 'lte' : 'preferred',
        value: targetBeds != null ? Math.max(targetBeds - 1, state.passengers ?? 1) : state.passengers ?? 1,
        strength,
        sourceText: refinementIntent.sourceText,
      })
      return {
        note: targetSlug
          ? `STATE-DRIVEN REFINEMENT: user asked for a smaller option relative to ${targetSlug}. Evaluation Engine was rerun with updated ConversationState.`
          : 'STATE-DRIVEN REFINEMENT: user asked for a smaller option. Evaluation Engine was rerun with updated ConversationState.',
        stateDeltaSummary: [`attributePreferences.beds=${targetBeds != null ? `lte:${Math.max(targetBeds - 1, state.passengers ?? 1)}` : 'preferred'}`],
      }

    case 'different': {
      const excludedSlug = targetSlug ?? state.lastShownCamperSlug
      if (excludedSlug) {
        state.alreadyRecommendedSlugs = [
          ...new Set([...(state.alreadyRecommendedSlugs ?? []), excludedSlug]),
        ]
      }
      return {
        note: excludedSlug
          ? `STATE-DRIVEN REFINEMENT: user asked for a different option, excluding ${excludedSlug}. Evaluation Engine was rerun with updated ConversationState.`
          : 'STATE-DRIVEN REFINEMENT: user asked for a different option. Evaluation Engine was rerun with updated ConversationState.',
        stateDeltaSummary: excludedSlug ? [`alreadyRecommendedSlugs+=${excludedSlug}`] : [],
      }
    }

    case 'keep_current':
    case 'prefer_previous':
      if (targetSlug) {
        state.selectedCamperSlug = targetSlug
        state.lastShownCamperSlug = targetSlug
      }
      return {
        note: targetSlug
          ? `STATE-DRIVEN REFINEMENT: user focused the current recommendation on ${targetSlug}. Evaluation Engine was rerun with updated ConversationState.`
          : 'STATE-DRIVEN REFINEMENT: user wants to keep the current recommendation focus. Evaluation Engine was rerun with updated ConversationState.',
        stateDeltaSummary: targetSlug ? [`selectedCamperSlug=${targetSlug}`, `lastShownCamperSlug=${targetSlug}`] : [],
      }

    case 'similar':
      return {
        note: targetSlug
          ? `STATE-DRIVEN REFINEMENT: user asked for a similar option to ${targetSlug}. Evaluation Engine was rerun with updated ConversationState.`
          : 'STATE-DRIVEN REFINEMENT: user asked for a similar option. Evaluation Engine was rerun with updated ConversationState.',
        stateDeltaSummary: targetSlug ? [`similarTo=${targetSlug}`] : [],
      }

    case 'remove_constraint':
    case 'add_constraint':
      return {
        note: 'STATE-DRIVEN REFINEMENT: user changed a constraint. Evaluation Engine was rerun with updated ConversationState.',
        stateDeltaSummary: ['constraint_change'],
      }

    default:
      return undefined
  }
}

export function applyLegacyRefinement(
  results: CamperResult[],
  preference: RefinementPreference | null | undefined,
  lastPrice?: number,
): LegacyRefinementResult {
  if (!preference) return { refined: results, boundaryReached: false }
  const sorted = [...results]
  const priced = (items: CamperResult[]) => items.filter(item => positivePriceOrUndefined(item.price_per_day) !== undefined)
  const priceOf = (item: CamperResult) => positivePriceOrUndefined(item.price_per_day)!

  switch (preference) {
    case 'cheaper': {
      const filtered = lastPrice !== undefined
        ? priced(sorted).filter(c => priceOf(c) < lastPrice).sort((a, b) => priceOf(b) - priceOf(a))
        : priced(sorted).sort((a, b) => priceOf(a) - priceOf(b))
      return { refined: filtered, boundaryReached: filtered.length === 0 && results.length > 0 }
    }
    case 'more_expensive': {
      const filtered = lastPrice !== undefined
        ? priced(sorted).filter(c => priceOf(c) > lastPrice).sort((a, b) => priceOf(a) - priceOf(b))
        : priced(sorted).sort((a, b) => priceOf(b) - priceOf(a))
      return { refined: filtered, boundaryReached: filtered.length === 0 && results.length > 0 }
    }
    case 'smaller':
      return { refined: sorted.sort((a, b) => (a.beds ?? 4) - (b.beds ?? 4)), boundaryReached: false }
    case 'bigger':
      return { refined: sorted.sort((a, b) => (b.beds ?? 4) - (a.beds ?? 4)), boundaryReached: false }
    case 'different':
    default:
      return { refined: results, boundaryReached: results.length === 0 }
  }
}

export function buildLegacyRefinementNote(
  preference: RefinementPreference,
  options: { boundaryReached: boolean; lastPrice?: number },
): string {
  if (options.boundaryReached) {
    return LEGACY_REFINEMENT_BOUNDARY_NOTES[preference] ?? 'HATÁRESET: nincs más megfelelő alternatíva a jelenlegi feltételek alapján.'
  }
  return LEGACY_REFINEMENT_NOTES[preference](options.lastPrice)
}

export function inferRefinementConcernType(update: Partial<ConversationState>): MemoryConcernType | null {
  const refinement = legacyRefinementPreferenceFromUpdate(update)
  switch (refinement) {
    case 'cheaper':
    case 'more_expensive':
      return 'price'
    case 'smaller':
    case 'bigger':
      return 'size'
    case 'different':
      return 'preference'
    default:
      return null
  }
}
