create table if not exists public.ai_chat_cache (
  cache_key text primary key,
  exam_slug text not null,
  question_norm text not null,
  revision text not null,
  route text not null,
  answer text not null,
  contexts jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_chat_cache_exam_slug_check check (exam_slug in ('transfer', 'cpa'))
);

create index if not exists ai_chat_cache_exam_question_idx
  on public.ai_chat_cache (exam_slug, question_norm);

create index if not exists ai_chat_cache_expires_idx
  on public.ai_chat_cache (expires_at);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_chat_cache_updated_at on public.ai_chat_cache;
create trigger set_ai_chat_cache_updated_at
before update on public.ai_chat_cache
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.ai_chat_cache enable row level security;

drop policy if exists "ai_chat_cache_admin_read" on public.ai_chat_cache;
create policy "ai_chat_cache_admin_read" on public.ai_chat_cache
for select using (public.is_admin());

drop policy if exists "ai_chat_cache_admin_write" on public.ai_chat_cache;
create policy "ai_chat_cache_admin_write" on public.ai_chat_cache
for all using (public.is_admin()) with check (public.is_admin());
