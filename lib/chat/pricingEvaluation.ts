import { computeFreeSlots } from './availability'
import {
  getSearchWindow,
  type CamperFact,
  type DiscountFact,
  type EvaluationFacts,
  type SeasonFact,
} from './evaluationFacts'
import {
  EVALUATION_SCORE_POLICY,
  HARD_FAILURE_LABELS,
} from './evaluationPolicy'
import type { HardFailure, ScoreBreakdownItem } from './evaluation'
import type { ConversationState } from './state'

export type PricingStatus = 'priced' | 'missing_price' | 'not_applicable'

export interface EvaluationPricing {
  status: PricingStatus
  seasonId?: string
  seasonName?: string
  pricePerDay?: number
  durationDays?: number
  subtotal?: number
  discountPercent?: number
  discountAmount?: number
  total?: number
}

export interface DiscountOpportunity {
  type: 'duration_discount_opportunity'
  currentDurationDays: number
  suggestedDurationDays: number
  discountPercent: number
  availabilityConfirmed: boolean
  pricingCalculated: boolean
}

function getPricingDate(state: ConversationState): string | undefined {
  if (state.startDate) return state.startDate
  if (state.month) return `${state.month}-01`
  return undefined
}

function mdFromDate(date: string): string {
  return date.slice(5, 10)
}

function seasonContains(season: SeasonFact, md: string): boolean {
  if (season.fromMd <= season.toMd) return md >= season.fromMd && md <= season.toMd
  return md >= season.fromMd || md <= season.toMd
}

export function resolveSeason(seasons: SeasonFact[], date?: string): SeasonFact | undefined {
  if (!date) return undefined
  const md = mdFromDate(date)
  return [...seasons]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find(season => seasonContains(season, md))
}

export function activeDiscounts(facts: EvaluationFacts): DiscountFact[] {
  if (!facts.globalDiscountsActive) return []
  return facts.discounts
    .filter(discount => discount.active)
    .sort((a, b) => b.minDays - a.minDays)
}

export function bestDiscountForDuration(facts: EvaluationFacts, durationDays?: number): DiscountFact | undefined {
  if (!durationDays) return undefined
  return activeDiscounts(facts).find(discount => durationDays >= discount.minDays)
}

export function calculatePricing(
  facts: EvaluationFacts,
  camper: CamperFact,
  state: ConversationState,
): EvaluationPricing {
  if (!state.durationDays) return { status: 'not_applicable' }
  const season = resolveSeason(facts.seasons, getPricingDate(state))
  if (!season) return { status: 'missing_price', durationDays: state.durationDays }

  const pricePerDay = facts.pricesByCamperSeason[camper.id]?.[season.id]
  if (!pricePerDay) {
    return {
      status: 'missing_price',
      seasonId: season.id,
      seasonName: season.name,
      durationDays: state.durationDays,
    }
  }

  const subtotal = pricePerDay * state.durationDays
  const discount = bestDiscountForDuration(facts, state.durationDays)
  const discountPercent = discount?.discountPercent ?? 0
  const discountAmount = Math.round(subtotal * (discountPercent / 100))

  return {
    status: 'priced',
    seasonId: season.id,
    seasonName: season.name,
    pricePerDay,
    durationDays: state.durationDays,
    subtotal,
    discountPercent,
    discountAmount,
    total: subtotal - discountAmount,
  }
}

function comparablePrice(pricing: EvaluationPricing): number | undefined {
  return pricing.total ?? pricing.pricePerDay
}

export function evaluatePricingPreferenceRequirement(
  pricing: EvaluationPricing,
  state: ConversationState,
): HardFailure[] {
  const preference = state.pricingPreference
  if (!preference) return []

  if (
    preference.intent === 'cheaper' &&
    typeof preference.referencePricePerDay === 'number' &&
    Number.isFinite(preference.referencePricePerDay)
  ) {
    const actualPrice = pricing.pricePerDay
    if (actualPrice == null || actualPrice >= preference.referencePricePerDay) {
      return [{
        key: 'pricing_budget',
        label: HARD_FAILURE_LABELS.pricing_budget,
        budgetAmount: preference.referencePricePerDay,
        actualPrice: actualPrice ?? null,
      }]
    }
    return []
  }

  if (preference.intent !== 'budget_limit' || preference.strength !== 'hard') return []

  const budgetAmount = preference.amount
  if (!budgetAmount) return []

  const actualPrice = comparablePrice(pricing)
  if (actualPrice == null || actualPrice > budgetAmount) {
    return [{
      key: 'pricing_budget',
      label: HARD_FAILURE_LABELS.pricing_budget,
      budgetAmount,
      actualPrice: actualPrice ?? null,
    }]
  }

  return []
}

export function scorePricingPreference(
  pricing: EvaluationPricing,
  state: ConversationState,
): ScoreBreakdownItem[] {
  const preference = state.pricingPreference
  if (!preference || preference.intent !== 'budget_limit' || preference.strength !== 'soft') return []

  const budgetAmount = preference.amount
  const actualPrice = comparablePrice(pricing)
  if (!budgetAmount || actualPrice == null || actualPrice > budgetAmount) return []

  return [{
    key: EVALUATION_SCORE_POLICY.pricingPreferenceMatch.key,
    label: EVALUATION_SCORE_POLICY.pricingPreferenceMatch.label,
    points: EVALUATION_SCORE_POLICY.pricingPreferenceMatch.points,
    budgetAmount,
    actualPrice,
  }]
}

export function buildDiscountOpportunity(
  facts: EvaluationFacts,
  camper: CamperFact,
  state: ConversationState,
  availableSlots: { from: string; to: string; days: number }[],
): DiscountOpportunity | undefined {
  if (!state.durationDays) return undefined
  const currentDurationDays = state.durationDays
  const nextDiscount = activeDiscounts(facts)
    .sort((a, b) => a.minDays - b.minDays)
    .find(discount => discount.minDays > currentDurationDays)
  if (!nextDiscount) return undefined

  const hasAvailability = availableSlots.some(slot => slot.days >= nextDiscount.minDays)
    || (() => {
      const window = getSearchWindow(state)
      if (!window.hasAvailabilityConstraint || !window.from || !window.to) return false
      const bookings = facts.bookingsByCamperId[camper.id] ?? []
      const freeSlots = computeFreeSlots(
        bookings.map(booking => ({ start_date: booking.startDate, end_date: booking.endDate, status: 'confirmed' })),
        window.from,
        window.to,
        nextDiscount.minDays,
      )
      return freeSlots.some(slot => slot.days >= nextDiscount.minDays)
    })()
  if (!hasAvailability) return undefined

  const suggestedPricing = calculatePricing(facts, camper, {
    ...state,
    durationDays: nextDiscount.minDays,
  })
  if (suggestedPricing.status !== 'priced') return undefined

  return {
    type: 'duration_discount_opportunity',
    currentDurationDays,
    suggestedDurationDays: nextDiscount.minDays,
    discountPercent: nextDiscount.discountPercent,
    availabilityConfirmed: true,
    pricingCalculated: true,
  }
}
