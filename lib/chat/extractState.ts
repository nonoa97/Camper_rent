import OpenAI from 'openai'
import { ConversationState, ConversationStateUpdate, extractStateFromMessage } from './state'
import { buildExtractionPrompt } from './extractorPrompt'
import { parseExtractorStateUpdate } from './extractorParser'
import { applyContextFallback, normalizeForMatch } from './extractorFallbacks'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

type StateUpdate = ConversationStateUpdate

async function extractWithGPT(
  message: string,
  history: { role: string; content: string }[],
  currentState: ConversationState,
): Promise<StateUpdate> {
  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: buildExtractionPrompt(currentState) },
      // Last 3 turns (6 messages) — enough context without inflating tokens
      ...(history.slice(-6) as { role: 'user' | 'assistant'; content: string }[]),
      { role: 'user', content: message },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 520,
    temperature: 0,
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  return parseExtractorStateUpdate({
    raw,
    message,
    currentState,
    normalizeForMatch,
  })
}

/**
 * Extracts structured state updates from a user message using GPT-4o-mini with full context.
 * Passes conversation history + current state so GPT can interpret short/indirect answers.
 * Falls back to regex if the API call fails.
 */
export async function extractStateUpdate(
  message: string,
  history: { role: string; content: string }[],
  currentState: ConversationState,
): Promise<StateUpdate> {
  try {
    return applyContextFallback(
      message,
      currentState.lastAskedField,
      await extractWithGPT(message, history, currentState),
    )
  } catch {
    return applyContextFallback(
      message,
      currentState.lastAskedField,
      extractStateFromMessage(message, history, currentState),
    )
  }
}
