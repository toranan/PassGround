create table if not exists public.ai_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  exam_slug text not null,
  raw_input text not null,
  question text not null default '',
  answer text not null default '',
  tags text[] not null default '{}',
  status text not null default 'pending',
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_items_exam_slug_check check (exam_slug in ('transfer', 'cpa')),
  constraint ai_knowledge_items_status_check check (status in ('pending', 'approved'))
);

create index if not exists ai_knowledge_items_exam_status_idx
  on public.ai_knowledge_items (exam_slug, status, updated_at desc);

create index if not exists ai_knowledge_items_updated_idx
  on public.ai_knowledge_items (updated_at desc);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_knowledge_items_updated_at on public.ai_knowledge_items;
create trigger set_ai_knowledge_items_updated_at
before update on public.ai_knowledge_items
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.ai_knowledge_items enable row level security;

drop policy if exists "ai_knowledge_items_admin_read" on public.ai_knowledge_items;
create policy "ai_knowledge_items_admin_read" on public.ai_knowledge_items
for select using (public.is_admin());

drop policy if exists "ai_knowledge_items_admin_write" on public.ai_knowledge_items;
create policy "ai_knowledge_items_admin_write" on public.ai_knowledge_items
for all using (public.is_admin()) with check (public.is_admin());
