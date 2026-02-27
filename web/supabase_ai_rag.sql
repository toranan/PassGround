create extension if not exists vector;

create table if not exists public.ai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references public.ai_knowledge_items(id) on delete cascade,
  exam_slug text not null,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(1536) not null,
  token_estimate int not null default 0,
  created_at timestamptz not null default now(),
  constraint ai_knowledge_chunks_exam_slug_check check (exam_slug in ('transfer', 'cpa')),
  constraint ai_knowledge_chunks_unique unique (knowledge_item_id, chunk_index)
);

create index if not exists ai_knowledge_chunks_exam_idx
  on public.ai_knowledge_chunks (exam_slug, created_at desc);

create index if not exists ai_knowledge_chunks_item_idx
  on public.ai_knowledge_chunks (knowledge_item_id);

create index if not exists ai_knowledge_chunks_embedding_ivfflat
  on public.ai_knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_ai_knowledge_chunks(
  query_embedding vector(1536),
  query_exam text,
  match_count int default 6,
  min_similarity float default 0.70
)
returns table (
  id uuid,
  knowledge_item_id uuid,
  chunk_text text,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.knowledge_item_id,
    c.chunk_text,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.ai_knowledge_chunks c
  join public.ai_knowledge_items i
    on i.id = c.knowledge_item_id
  where c.exam_slug = query_exam
    and i.status = 'approved'
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

create table if not exists public.ai_chat_logs (
  id uuid primary key default gen_random_uuid(),
  exam_slug text not null,
  question text not null,
  answer text not null,
  route text not null,
  top_chunk_ids uuid[] not null default '{}',
  top_knowledge_item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint ai_chat_logs_exam_slug_check check (exam_slug in ('transfer', 'cpa'))
);

create index if not exists ai_chat_logs_exam_created_idx
  on public.ai_chat_logs (exam_slug, created_at desc);

alter table public.ai_knowledge_chunks enable row level security;
alter table public.ai_chat_logs enable row level security;

drop policy if exists "ai_knowledge_chunks_read" on public.ai_knowledge_chunks;
create policy "ai_knowledge_chunks_read" on public.ai_knowledge_chunks
for select using (true);

drop policy if exists "ai_knowledge_chunks_admin_write" on public.ai_knowledge_chunks;
create policy "ai_knowledge_chunks_admin_write" on public.ai_knowledge_chunks
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ai_chat_logs_admin_read" on public.ai_chat_logs;
create policy "ai_chat_logs_admin_read" on public.ai_chat_logs
for select using (public.is_admin());

drop policy if exists "ai_chat_logs_insert_service" on public.ai_chat_logs;
create policy "ai_chat_logs_insert_service" on public.ai_chat_logs
for insert with check (true);
