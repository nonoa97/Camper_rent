import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ConversationState, FlowState, SessionMemory } from './state'

type HistoryItem = { role: 'user' | 'assistant'; content: string }

type ChatDebugLoggerInput = {
  message?: unknown
  history?: HistoryItem[]
  incomingState?: ConversationState
  incomingFlowState?: FlowState
  incomingSessionMemory?: SessionMemory
  conversationId?: string | null
  requestId?: string
}

export type ChatDebugStage = {
  stage: string
  data?: unknown
}

export type ChatDebugTurnLog = {
  type: 'chat_debug_turn'
  conversationId: string
  requestId: string
  outcome: string
  request: {
    message: unknown
    history: Array<{ role: string; content: string }>
    historyLength: number
  }
  incoming: {
    state: unknown
    flowState: unknown
    sessionMemory: unknown
  }
  stages: ChatDebugStage[]
  result?: unknown
}

type ChatDebugLogTarget = 'file' | 'supabase' | 'both'

const MAX_STRING_LENGTH = 1200
const MAX_ARRAY_LENGTH = 16
const MAX_DEPTH = 6

function isEnabled(): boolean {
  if (process.env.CHAT_DEBUG_LOGS === 'false' || process.env.CHAT_DEBUG_LOGS === '0') return false
  if (process.env.CHAT_DEBUG_LOGS === 'true' || process.env.CHAT_DEBUG_LOGS === '1') return true
  if (process.env.NODE_ENV === 'test') return false
  return process.env.NODE_ENV !== 'production'
}

function createRequestId(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `chat_${Date.now().toString(36)}_${random}`
}

function createConversationId(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `conversation_${Date.now().toString(36)}_${random}`
}

function normalizeDebugId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, 120)
}

function chatDebugLogPath(): string {
  return resolve(process.cwd(), process.env.CHAT_DEBUG_LOG_PATH || 'logs/chat-debug.ndjson')
}

function getLogTarget(): ChatDebugLogTarget {
  const target = process.env.CHAT_DEBUG_LOG_TARGET?.trim().toLowerCase()
  if (target === 'supabase' || target === 'both') return target
  return 'file'
}

function getStageData(payload: ChatDebugTurnLog, stage: string): any {
  return payload.stages.find(item => item.stage === stage)?.data
}

function getAssistantReply(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const reply = (result as { reply?: unknown }).reply
  return typeof reply === 'string' ? reply : null
}

function getRecommendationSlugs(result: unknown): string[] | null {
  if (!result || typeof result !== 'object') return null
  const slugs = (result as { recommendationSlugs?: unknown }).recommendationSlugs
  if (Array.isArray(slugs)) return slugs.filter((slug): slug is string => typeof slug === 'string')
  const recommendations = (result as { recommendations?: unknown }).recommendations
  if (!Array.isArray(recommendations)) return null
  return recommendations
    .map(item => typeof item === 'object' && item ? (item as { slug?: unknown }).slug : undefined)
    .filter((slug): slug is string => typeof slug === 'string')
}

function getModeSummary(payload: ChatDebugTurnLog): { mode: string | null; effectiveMode: string | null } {
  const result = payload.result && typeof payload.result === 'object' ? payload.result as any : {}
  const modeStage = getStageData(payload, 'mode_resolved') ?? {}
  return {
    mode: typeof result.mode === 'string' ? result.mode : typeof modeStage.mode === 'string' ? modeStage.mode : null,
    effectiveMode: typeof result.effectiveMode === 'string'
      ? result.effectiveMode
      : typeof modeStage.effectiveMode === 'string'
        ? modeStage.effectiveMode
        : null,
  }
}

function createSupabaseDebugRow(payload: ChatDebugTurnLog) {
  const result = payload.result && typeof payload.result === 'object' ? payload.result as any : {}
  const mode = getModeSummary(payload)
  const evaluationSummary = getStageData(payload, 'recommendation_evaluation')
  const availabilitySummary = {
    availabilitySlotCount: typeof result.availabilitySlotCount === 'number' ? result.availabilitySlotCount : undefined,
    availabilitySearch: getStageData(payload, 'availability_search_completed'),
  }

  return {
    conversation_id: payload.conversationId,
    turn_id: payload.requestId,
    stage: 'turn_complete',
    outcome: payload.outcome,
    user_message: typeof payload.request.message === 'string' ? payload.request.message : null,
    assistant_reply: getAssistantReply(payload.result),
    mode: mode.mode,
    effective_mode: mode.effectiveMode,
    state_snapshot: result.updatedState ?? payload.incoming.state ?? {},
    session_memory_snapshot: result.updatedSessionMemory ?? payload.incoming.sessionMemory ?? {},
    extractor_output: getStageData(payload, 'state_extracted') ?? null,
    evaluation_summary: evaluationSummary ?? null,
    recommendation_slugs: getRecommendationSlugs(payload.result),
    availability_summary: availabilitySummary,
    error: payload.outcome === 'error' ? getStageData(payload, 'error') ?? null : null,
    metadata: payload,
  }
}

async function writeChatDebugTurnLogToSupabase(payload: ChatDebugTurnLog): Promise<void> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const { error } = await supabaseAdmin
      .from('chat_debug_events')
      .insert(createSupabaseDebugRow(payload))
    if (error) {
      console.error('[chatDebugLogger] Supabase insert failed', error)
    }
  } catch (error) {
    console.error('[chatDebugLogger] Supabase logging failed', error)
  }
}

function writeChatDebugTurnLogToFile(payload: ChatDebugTurnLog): void {
  const target = chatDebugLogPath()
  mkdirSync(dirname(target), { recursive: true })
  appendFileSync(target, `${JSON.stringify(payload)}\n`, 'utf8')
}

export async function writeChatDebugTurnLog(payload: ChatDebugTurnLog): Promise<void> {
  const target = getLogTarget()
  if (target === 'file' || target === 'both') {
    writeChatDebugTurnLogToFile(payload)
  }
  if (target === 'supabase' || target === 'both') {
    await writeChatDebugTurnLogToSupabase(payload)
  }
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated:${value.length}]`
}

export function sanitizeForChatDebug(value: unknown, depth = 0): unknown {
  if (value == null) return value
  if (typeof value === 'string') return truncateString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function') return '[function]'
  if (depth >= MAX_DEPTH) return '[max_depth]'
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_LENGTH).map(item => sanitizeForChatDebug(item, depth + 1))
    if (value.length > MAX_ARRAY_LENGTH) {
      items.push(`[truncated:${value.length - MAX_ARRAY_LENGTH}]`)
    }
    return items
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? truncateString(value.stack) : undefined,
    }
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, sanitizeForChatDebug(item, depth + 1)]),
    )
  }
  return String(value)
}

export type ChatDebugLogger = {
  requestId: string
  enabled: boolean
  stage: (stage: string, data?: unknown) => void
  finish: (outcome: string, result?: unknown) => Promise<void>
  error: (error: unknown, result?: unknown) => Promise<void>
}

export function createChatDebugLogger(input: ChatDebugLoggerInput): ChatDebugLogger {
  const enabled = isEnabled()
  const requestId = input.requestId ?? createRequestId()
  const conversationId = normalizeDebugId(input.conversationId) ?? createConversationId()
  const stages: ChatDebugStage[] = []
  let finished = false

  const logger: ChatDebugLogger = {
    requestId,
    enabled,
    stage(stage, data) {
      if (!enabled || finished) return
      stages.push({
        stage,
        data: sanitizeForChatDebug(data),
      })
    },
    async finish(outcome, result) {
      if (!enabled || finished) return
      finished = true
      const payload: ChatDebugTurnLog = {
        type: 'chat_debug_turn',
        conversationId,
        requestId,
        outcome,
        request: {
          message: sanitizeForChatDebug(input.message),
          history: (input.history ?? []).slice(-6).map(item => ({
            role: item.role,
            content: truncateString(item.content),
          })),
          historyLength: input.history?.length ?? 0,
        },
        incoming: {
          state: sanitizeForChatDebug(input.incomingState ?? {}),
          flowState: sanitizeForChatDebug(input.incomingFlowState ?? {}),
          sessionMemory: sanitizeForChatDebug(input.incomingSessionMemory ?? {}),
        },
        stages,
        result: sanitizeForChatDebug(result),
      }
      await writeChatDebugTurnLog(payload)
    },
    async error(error, result) {
      logger.stage('error', { error })
      await logger.finish('error', result)
    },
  }

  logger.stage('request_received')
  return logger
}
