-- Notifications for mobile community events (comment/reply).
-- Run this once in Supabase SQL editor.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '익명',
  type text not null default 'new_comment',
  title text not null,
  body text not null default '',
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  exam_slug text,
  board_slug text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, is_read);

alter table public.notifications enable row level security;

create policy "notifications_read_own" on public.notifications
for select using (auth.uid() = recipient_id or public.is_admin());

create policy "notifications_update_own" on public.notifications
for update using (auth.uid() = recipient_id or public.is_admin())
with check (auth.uid() = recipient_id or public.is_admin());

create policy "notifications_insert_service_or_admin" on public.notifications
for insert with check (public.is_admin() or auth.uid() = actor_id);

