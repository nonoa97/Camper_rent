create table if not exists public.chat_debug_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id text not null,
  turn_id text not null,
  stage text not null default 'turn_complete',
  outcome text,
  user_message text,
  assistant_reply text,
  mode text,
  effective_mode text,
  state_snapshot jsonb not null default '{}'::jsonb,
  session_memory_snapshot jsonb not null default '{}'::jsonb,
  extractor_output jsonb,
  evaluation_summary jsonb,
  recommendation_slugs text[],
  availability_summary jsonb,
  error jsonb,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.chat_debug_events enable row level security;

create unique index if not exists chat_debug_events_turn_stage_unique
  on public.chat_debug_events (conversation_id, turn_id, stage);

create index if not exists chat_debug_events_conversation_created_idx
  on public.chat_debug_events (conversation_id, created_at);

create index if not exists chat_debug_events_created_idx
  on public.chat_debug_events (created_at desc);

create index if not exists chat_debug_events_outcome_idx
  on public.chat_debug_events (outcome);

comment on table public.chat_debug_events is
  'Backend-owned chatbot debug logs. No public RLS policies; write via service role only.';

comment on column public.chat_debug_events.metadata is
  'Full sanitized chat debug turn payload, including stage snapshots.';
