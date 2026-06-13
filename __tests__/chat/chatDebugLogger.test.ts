import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatDebugLogger } from '@/lib/chat/chatDebugLogger'

const mockInsert = vi.fn()
const mockFrom = vi.fn(() => ({ insert: mockInsert }))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}))

describe('Chat debug logger', () => {
  const originalFlag = process.env.CHAT_DEBUG_LOGS
  const originalPath = process.env.CHAT_DEBUG_LOG_PATH
  const originalTarget = process.env.CHAT_DEBUG_LOG_TARGET
  let tempDir = ''
  let logPath = ''

  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({ error: null })
    tempDir = mkdtempSync(join(tmpdir(), 'chat-debug-'))
    logPath = join(tempDir, 'chat-debug.ndjson')
    process.env.CHAT_DEBUG_LOG_PATH = logPath
  })

  afterEach(() => {
    process.env.CHAT_DEBUG_LOGS = originalFlag
    process.env.CHAT_DEBUG_LOG_PATH = originalPath
    process.env.CHAT_DEBUG_LOG_TARGET = originalTarget
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  function readLogLines() {
    return readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
  }

  it('does not write a log file when CHAT_DEBUG_LOGS is disabled', () => {
    process.env.CHAT_DEBUG_LOGS = 'false'

    const logger = createChatDebugLogger({
      conversationId: 'conversation-a',
      requestId: 'request-a',
      message: 'Szia',
    })
    logger.stage('state_extracted', { intent: 'catalog' })
    logger.finish('success')

    expect(existsSync(logPath)).toBe(false)
  })

  it('writes an ndjson turn grouped by conversationId and requestId without timing fields', () => {
    process.env.CHAT_DEBUG_LOGS = 'true'

    const logger = createChatDebugLogger({
      conversationId: 'conversation-a',
      requestId: 'request-a',
      message: 'Van ebben zuhanyzó?',
      history: [{ role: 'user', content: 'Milyen ez az autó?' }],
      incomingState: { intent: 'catalog' },
    })
    logger.stage('state_extracted', { intent: 'catalog' })
    logger.stage('mode_resolved', { mode: 'catalog' })
    logger.finish('success', { reply: 'Igen.' })

    const [payload] = readLogLines()

    expect(payload.conversationId).toBe('conversation-a')
    expect(payload.requestId).toBe('request-a')
    expect(payload.outcome).toBe('success')
    expect(payload.stages.map((stage: { stage: string }) => stage.stage)).toEqual([
      'request_received',
      'state_extracted',
      'mode_resolved',
    ])
    expect(payload.durationMs).toBeUndefined()
    expect(payload.startedAt).toBeUndefined()
    expect(payload.endedAt).toBeUndefined()
    expect(payload.stages[0].atMs).toBeUndefined()
  })

  it('truncates long strings in debug payloads', () => {
    process.env.CHAT_DEBUG_LOGS = '1'

    const logger = createChatDebugLogger({
      conversationId: 'conversation-a',
      requestId: 'request-a',
      message: 'x'.repeat(1300),
    })
    logger.finish('success')

    const [payload] = readLogLines()

    expect(payload.request.message).toContain('[truncated:1300]')
  })

  it('appends multiple turns for the same conversation to the same log file', () => {
    process.env.CHAT_DEBUG_LOGS = 'true'

    createChatDebugLogger({
      conversationId: 'conversation-a',
      requestId: 'request-1',
      message: 'Első kérdés',
    }).finish('success')
    createChatDebugLogger({
      conversationId: 'conversation-a',
      requestId: 'request-2',
      message: 'Második kérdés',
    }).finish('success')

    const lines = readLogLines()
    expect(lines).toHaveLength(2)
    expect(lines.map(line => line.conversationId)).toEqual(['conversation-a', 'conversation-a'])
    expect(lines.map(line => line.requestId)).toEqual(['request-1', 'request-2'])
  })

  it('writes a sanitized turn row to Supabase when CHAT_DEBUG_LOG_TARGET=supabase', async () => {
    process.env.CHAT_DEBUG_LOGS = 'true'
    process.env.CHAT_DEBUG_LOG_TARGET = 'supabase'

    const logger = createChatDebugLogger({
      conversationId: 'conversation-db',
      requestId: 'request-db',
      message: 'Mutass egy olcsóbbat',
      incomingState: { intent: 'recommendation' },
    })
    logger.stage('state_extracted', { stateUpdate: { refinementIntent: { intent: 'cheaper' } } })
    logger.stage('mode_resolved', { mode: 'recommend', effectiveMode: 'recommend' })
    await logger.finish('success', {
      reply: 'Kerestem olcsóbb opciót.',
      recommendationSlugs: ['camper-a'],
      updatedState: { intent: 'recommendation' },
      updatedSessionMemory: { shownOptions: [] },
    })

    expect(existsSync(logPath)).toBe(false)
    expect(mockFrom).toHaveBeenCalledWith('chat_debug_events')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      conversation_id: 'conversation-db',
      turn_id: 'request-db',
      stage: 'turn_complete',
      outcome: 'success',
      user_message: 'Mutass egy olcsóbbat',
      assistant_reply: 'Kerestem olcsóbb opciót.',
      mode: 'recommend',
      effective_mode: 'recommend',
      recommendation_slugs: ['camper-a'],
      state_snapshot: { intent: 'recommendation' },
      session_memory_snapshot: { shownOptions: [] },
      extractor_output: { stateUpdate: { refinementIntent: { intent: 'cheaper' } } },
      metadata: expect.objectContaining({
        conversationId: 'conversation-db',
        requestId: 'request-db',
      }),
    }))
  })
})
