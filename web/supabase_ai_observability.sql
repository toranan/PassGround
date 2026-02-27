create table if not exists public.ai_chat_observations (
  id bigserial primary key,
  trace_id text not null,
  exam_slug text not null,
  route text not null,
  cache_status text not null,
  status text not null,
  question_length int not null default 0,
  answer_length int not null default 0,
  matched_context_count int not null default 0,
  min_similarity float not null default 0,
  match_count int not null default 0,
  has_enough_context boolean not null default false,
  provider text not null default '',
  chat_model text not null default '',
  embedding_model text not null default '',
  total_ms int not null default 0,
  cache_ms int not null default 0,
  embedding_ms int not null default 0,
  retrieval_ms int not null default 0,
  generation_ms int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  constraint ai_chat_observations_exam_slug_check check (exam_slug in ('transfer', 'cpa'))
);

create index if not exists ai_chat_observations_exam_created_idx
  on public.ai_chat_observations (exam_slug, created_at desc);

create index if not exists ai_chat_observations_trace_idx
  on public.ai_chat_observations (trace_id);

alter table public.ai_chat_observations enable row level security;

drop policy if exists "ai_chat_observations_admin_read" on public.ai_chat_observations;
create policy "ai_chat_observations_admin_read" on public.ai_chat_observations
for select using (public.is_admin());

drop policy if exists "ai_chat_observations_insert_service" on public.ai_chat_observations;
create policy "ai_chat_observations_insert_service" on public.ai_chat_observations
for insert with check (true);
