import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { ConversationState, RefinementPreference, mergeState } from '@/lib/chat/state'
import { extractStateUpdate } from '@/lib/chat/extractState'
import { getNextMissingQuestion, NextQuestion } from '@/lib/chat/nextQuestion'
import { searchAvailableCampers, findEarliestAvailableCamper, getSpecificCamperAvailability, CamperResult } from '@/lib/chat/availability'
import { loadFaqItems, FaqItem } from '@/lib/chat/faq'
import { validateGptOutput, FALLBACK_OUTPUT } from '@/lib/chat/validateOutput'
import { SYSTEM_PROMPT, buildContextBlock, GptContext, SearchType } from '@/lib/chat/prompts'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type HistoryItem = { role: 'user' | 'assistant'; content: string }

type ApiRequest = {
  message: string
  history?: HistoryItem[]
  state?: ConversationState
}

type EnrichedRecommendation = {
  slug: string
  text: string
  name: string
  image_url: string
  price_per_day: number
  type: string | null
  capacity: string | null
}

type AvailabilitySlot = {
  slug: string
  name: string
  image_url: string
  price_per_day: number
  type: string | null
  capacity: string | null
  from: string
  to: string
  days: number
}

function parseCapacity(c: CamperResult): number {
  const m = (c.capacity ?? '').match(/\d+/)
  return m ? parseInt(m[0]) : 4
}

function applyRefinement(
  results: CamperResult[],
  preference: RefinementPreference | null | undefined,
  lastPrice?: number,
): { refined: CamperResult[]; boundaryReached: boolean } {
  if (!preference) return { refined: results, boundaryReached: false }
  const sorted = [...results]

  switch (preference) {
    case 'cheaper': {
      const filtered = lastPrice !== undefined
        ? sorted.filter(c => c.price_per_day < lastPrice).sort((a, b) => b.price_per_day - a.price_per_day)
        : sorted.sort((a, b) => a.price_per_day - b.price_per_day)
      return { refined: filtered, boundaryReached: filtered.length === 0 && results.length > 0 }
    }
    case 'more_expensive': {
      const filtered = lastPrice !== undefined
        ? sorted.filter(c => c.price_per_day > lastPrice).sort((a, b) => a.price_per_day - b.price_per_day)
        : sorted.sort((a, b) => b.price_per_day - a.price_per_day)
      return { refined: filtered, boundaryReached: filtered.length === 0 && results.length > 0 }
    }
    case 'smaller':
      return { refined: sorted.sort((a, b) => parseCapacity(a) - parseCapacity(b)), boundaryReached: false }
    case 'bigger':
      return { refined: sorted.sort((a, b) => parseCapacity(b) - parseCapacity(a)), boundaryReached: false }
    case 'different':
    default:
      return { refined: results, boundaryReached: results.length === 0 }
  }
}

const BOUNDARY_NOTES: Record<string, string> = {
  cheaper: 'HATÁRESET: nincs olcsóbb megfelelő lakóautó. Közöld: "Ez már a legolcsóbb megfelelő opció a jelenlegi feltételek alapján." Ajánlj segítséget a feltételek módosításában.',
  more_expensive: 'HATÁRESET: nincs drágább megfelelő lakóautó. Közöld: "Ez már a legdrágább megfelelő opció."',
  smaller: 'HATÁRESET: nincs kisebb megfelelő lakóautó. Közöld: "Ez már a legkisebb megfelelő opció."',
  bigger: 'HATÁRESET: nincs nagyobb megfelelő lakóautó. Közöld: "Ez már a legnagyobb megfelelő opció."',
  different: 'HATÁRESET: nincs meg nem mutatott megfelelő lakóautó. Közöld: "Minden megfelelő lakóautót megmutattam már." Segíts a feltételek módosításában.',
}

function resolveMode(state: ConversationState, nextQuestion: string | null): GptContext['mode'] {
  if (nextQuestion && state.intent !== 'faq' && state.intent !== 'booking' && state.intent !== 'catalog') {
    return 'ask_next_question'
  }
  switch (state.intent) {
    case 'faq':      return 'faq'
    case 'booking':  return 'booking'
    case 'catalog':  return 'catalog'
    case 'availability': return 'availability'
    default:         return 'recommend'
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: ApiRequest = await req.json()
    const { message, history = [], state: incomingState = {} } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Hiányzó üzenet' }, { status: 400 })
    }

    // 1. Update conversation state from new message (GPT-4o-mini extraction, regex fallback)
    const stateUpdate = await extractStateUpdate(message, history, incomingState)
    const state = mergeState(incomingState, stateUpdate)

    // 2. Detect specific camper availability query ("ez mikor elérhető?" after seeing a card)
    const targetSlug = state.selectedCamperSlug
      ?? (state.intent === 'availability' ? (state.lastShownCamperSlug ?? null) : null)
    const isSpecificCamperQuery = !!targetSlug && state.intent === 'availability'

    // 3. Determine next required question — skip checklist for specific camper queries
    const isChecklistFlow = !isSpecificCamperQuery &&
      (!state.intent || state.intent === 'recommendation' || state.intent === 'availability')
    const nextQuestionData: NextQuestion | null = isChecklistFlow ? getNextMissingQuestion(state) : null
    const nextQuestion = nextQuestionData?.question ?? null

    // Save which field we just asked about so extraction can interpret the next bare answer
    if (nextQuestionData && resolveMode(state, nextQuestion) === 'ask_next_question') {
      state.lastAskedField = nextQuestionData.field
      if (nextQuestionData.field === 'extraRequirements') {
        state.extraRequirementsAsked = true
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('\n=== CHAT PIPELINE ===')
      console.log('LAST ASKED:    ', incomingState.lastAskedField ?? 'none')
      console.log('EXTRACTED:     ', JSON.stringify(stateUpdate))
      console.log('UPDATED STATE: ', JSON.stringify({ ...state, alreadyRecommendedSlugs: state.alreadyRecommendedSlugs }))
      console.log('NEXT MISSING:  ', nextQuestionData?.field ?? 'none')
      console.log('NEXT QUESTION: ', nextQuestion ?? 'none')
      console.log('SPECIFIC SLUG: ', targetSlug ?? 'none')
      console.log('MODE:          ', isSpecificCamperQuery ? 'availability(specific)' : resolveMode(state, nextQuestion))
      console.log('=====================\n')
    }

    // 4. Determine mode
    const mode = isSpecificCamperQuery ? 'availability' : resolveMode(state, nextQuestion)

    // 4b. Load FAQ items from Supabase when mode is faq
    let faqItems: FaqItem[] | undefined
    if (mode === 'faq') {
      faqItems = await loadFaqItems()
    }

    // 5. Fetch available campers
    let camperResults: CamperResult[] = []
    let searchType: SearchType = 'specific'
    let requestedMonth: string | undefined

    if (isSpecificCamperQuery && targetSlug) {
      // Specific camper availability: search only for that one slug
      camperResults = await getSpecificCamperAvailability(targetSlug, state)

      // If month was given but returned empty → fall back to full 6-month window
      if (camperResults.length === 0 && state.month) {
        requestedMonth = state.month
        camperResults = await getSpecificCamperAvailability(targetSlug, { ...state, month: undefined })
        searchType = 'fallback_earliest'
      }
    } else if (mode === 'recommend' || mode === 'availability') {
      const hasExactRange = !!(state.startDate && state.endDate)

      if (state.earliestAvailable) {
        camperResults = await findEarliestAvailableCamper(state)
        searchType = 'earliest'
      } else {
        camperResults = await searchAvailableCampers(state)

        if (camperResults.length === 0 && !hasExactRange) {
          requestedMonth = state.month  // undefined if no month → no "requested month full" note
          camperResults = await findEarliestAvailableCamper(state)
          searchType = 'fallback_earliest'
        }
      }
    }

    // 5b. Exclude already-shown + apply refinement for recommendation mode
    const alreadyShown = new Set(state.alreadyRecommendedSlugs ?? [])
    let displayResults = camperResults
    let refinementNote: string | undefined

    if (mode === 'recommend') {
      const freshResults = camperResults.filter(c => !alreadyShown.has(c.slug))
      const currentRefinement = stateUpdate.refinementPreference ?? null

      if (freshResults.length === 0 && alreadyShown.size > 0 && !currentRefinement) {
        displayResults = []
        refinementNote = 'NINCS TÖBB OPCIÓ: A jelenlegi feltételek mellett minden megfelelő lakóautót megmutattam már. Segíts a felhasználónak módosítani a feltételein.'
      } else if (currentRefinement) {
        const { refined, boundaryReached } = applyRefinement(freshResults, currentRefinement, state.lastShownPrice)
        displayResults = refined
        if (boundaryReached) {
          refinementNote = BOUNDARY_NOTES[currentRefinement] ?? 'HATÁRESET: nincs más megfelelő alternatíva a jelenlegi feltételek alapján.'
        } else {
          const priceStr = state.lastShownPrice ? `${state.lastShownPrice.toLocaleString('hu-HU')} Ft/nap` : '?'
          const REFINEMENT_NOTES: Record<string, string> = {
            cheaper: `User olcsóbbat kért (előző ár: ${priceStr}). Ajánld a legközelebbi olcsóbb opciót az allowedCamperSlugs-ból.`,
            more_expensive: `User drágábbat kért (előző ár: ${priceStr}). Ajánld a legközelebbi drágább opciót.`,
            smaller: 'User kisebbet / kompaktabbat kért. Ajánld a legkisebb megfelelő opciót.',
            bigger: 'User nagyobbat / tágasabbat kért. Ajánld a legnagyobb megfelelő opciót.',
            different: 'User mást kért — ajánlj egy eddig nem mutatott autót az allowedCamperSlugs-ból.',
          }
          refinementNote = REFINEMENT_NOTES[currentRefinement]
        }
      } else {
        displayResults = freshResults
      }
    }

    const allowedSlugs = new Set(displayResults.map(c => c.slug))

    // Offer extras only on the first successful recommendation (when there are results and not yet offered)
    const offerExtras = mode === 'recommend' && displayResults.length > 0 && !state.extrasOffered

    // 6. Build GPT context
    const ctx: GptContext = {
      state,
      nextQuestion,
      camperResults: displayResults,
      allowedCamperSlugs: [...allowedSlugs],
      mode,
      searchType,
      requestedMonth,
      specificCamperSlug: isSpecificCamperQuery ? targetSlug : undefined,
      refinementNote,
      offerExtras,
      faqItems,
    }

    // 7. Call GPT
    const contextBlock = buildContextBlock(ctx)
    const completion = await openai.chat.completions.create({
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
    const output = validateGptOutput(raw, allowedSlugs, mode)

    // Guarantee the nextQuestion appears in the reply — GPT mini sometimes drops it
    if (mode === 'ask_next_question' && nextQuestion) {
      const replyHasQuestion = output.reply.includes(nextQuestion.substring(0, 20))
      if (!replyHasQuestion) {
        output.reply = output.reply
          ? `${output.reply.trim()} ${nextQuestion}`
          : nextQuestion
      }
    }

    // Specific camper queries never show recommendation chips
    if (isSpecificCamperQuery) {
      output.recommendations = []
    }

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
        state.lastShownPrice = lastShownCamper.price_per_day
      }
      if (offerExtras) {
        state.extrasOffered = true
      }
    }

    // 9. Enrich recommendations with camper data
    const camperMap = Object.fromEntries(camperResults.map(c => [c.slug, c]))
    const recommendations: EnrichedRecommendation[] = output.recommendations
      .filter(r => camperMap[r.slug])
      .map(r => ({
        slug: r.slug,
        text: r.reason,
        name: camperMap[r.slug].name,
        image_url: camperMap[r.slug].image_url,
        price_per_day: camperMap[r.slug].price_per_day,
        type: camperMap[r.slug].type,
        capacity: camperMap[r.slug].capacity,
      }))

    // 10. Build availability slots for UI (mode = availability)
    const availability: AvailabilitySlot[] = mode === 'availability'
      ? camperResults.flatMap(c =>
          c.availableSlots.map(slot => ({
            slug: c.slug,
            name: c.name,
            image_url: c.image_url,
            price_per_day: c.price_per_day,
            type: c.type,
            capacity: c.capacity,
            from: slot.from,
            to: slot.to,
            days: slot.days,
          })),
        )
      : []

    return NextResponse.json({
      reply: output.reply,
      recommendations,
      availability,
      links: output.links,
      updatedState: state,
    })
  } catch (err) {
    console.error('[chat/route]', err)
    return NextResponse.json({
      reply: FALLBACK_OUTPUT.reply,
      recommendations: [],
      availability: [],
      links: [],
    })
  }
}
